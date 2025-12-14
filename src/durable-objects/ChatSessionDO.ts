import { ChatMessage, ClientEvent, ServerCommand, StoredState } from "../types";

type Env = {
  AI: Ai;
};

const MAX_MESSAGES = 40; // bounded memory window
const SUMMARY_EVERY_N_MESSAGES = 12;

export class ChatSessionDO implements DurableObject {
  private state: DurableObjectState;
  private env: Env;
  private sessions = new Set<WebSocket>();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/ws") {
      const upgradeHeader = request.headers.get("Upgrade");
      if (upgradeHeader !== "websocket") return new Response("Expected websocket", { status: 426 });

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      await this.handleSession(server);

      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === "/state") {
      const stored = await this.readState();
      return Response.json(stored);
    }

    if (url.pathname === "/command" && request.method === "POST") {
      const cmd = (await request.json()) as ServerCommand;
      const result = await this.applyCommand(cmd);
      return Response.json(result);
    }

    return new Response("Not found", { status: 404 });
  }

  private async handleSession(ws: WebSocket) {
    ws.accept();
    this.sessions.add(ws);

    const stored = await this.readState();
    this.send(ws, { type: "hello", sessionId: this.state.id.toString() });
    this.send(ws, { type: "state", messages: stored.messages ?? [], summary: stored.summary });

    ws.addEventListener("message", async (evt) => {
      try {
        const cmd = JSON.parse(String(evt.data)) as ServerCommand;
        const result = await this.applyCommand(cmd);
        // state updates are broadcast by applyCommand; still return ack if needed
        if (result?.type === "error") this.send(ws, result);
      } catch (e) {
        this.send(ws, { type: "error", message: "Invalid message format." });
      }
    });

    ws.addEventListener("close", () => {
      this.sessions.delete(ws);
    });
    ws.addEventListener("error", () => {
      this.sessions.delete(ws);
    });
  }

  private send(ws: WebSocket, evt: ClientEvent) {
    try {
      ws.send(JSON.stringify(evt));
    } catch {
      // ignore
    }
  }

  private broadcast(evt: ClientEvent) {
    for (const ws of this.sessions) this.send(ws, evt);
  }

  private async readState(): Promise<StoredState> {
    const stored = (await this.state.storage.get<StoredState>("state")) ?? { messages: [] };
    stored.messages = stored.messages ?? [];
    return stored;
  }

  private async writeState(next: StoredState) {
    await this.state.storage.put("state", next);
  }

  private trimMessages(messages: ChatMessage[]): ChatMessage[] {
    if (messages.length <= MAX_MESSAGES) return messages;
    return messages.slice(messages.length - MAX_MESSAGES);
  }

  private async maybeSummarize(stored: StoredState): Promise<StoredState> {
    const msgs = stored.messages ?? [];
    if (msgs.length < SUMMARY_EVERY_N_MESSAGES) return stored;
    if (msgs.length % SUMMARY_EVERY_N_MESSAGES !== 0) return stored;

    // summarize last N messages + existing summary
    const summaryPrompt = [
      { role: "system", content: "Summarize the conversation so far in 6-10 bullet points. Keep it factual and compact. Include any user preferences and important details." },
      { role: "user", content: `Existing summary (if any):\n${stored.summary ?? "(none)"}\n\nRecent messages:\n${msgs.slice(-SUMMARY_EVERY_N_MESSAGES).map(m => `${m.role}: ${m.content}`).join("\n")}` }
    ];

    try {
      const resp = await this.env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
        messages: summaryPrompt
      });

      const newSummary = String((resp as any).response ?? (resp as any).result ?? "").trim();
      if (newSummary) stored.summary = newSummary;
    } catch {
      // keep old summary
    }

    return stored;
  }

  private buildContext(stored: StoredState): { role: "system" | "user" | "assistant"; content: string }[] {
    const systemParts: string[] = [
      "You are a helpful study assistant.",
      "Be accurate, concise, and step-by-step when needed.",
      "If the user asks for a quiz, produce questions first, then wait for answers."
    ];

    if (stored.profile?.topic) systemParts.push(`Topic focus: ${stored.profile.topic}`);
    if (stored.profile?.difficulty) systemParts.push(`Difficulty: ${stored.profile.difficulty}`);
    if (stored.profile?.format) systemParts.push(`Response format: ${stored.profile.format}`);

    const system = { role: "system" as const, content: systemParts.join(" ") };

    const memory: string[] = [];
    if (stored.summary) memory.push(`Conversation summary:\n${stored.summary}`);
    if (stored.notes) memory.push(`User notes/context:\n${stored.notes}`);

    const memoryBlock = memory.length ? [{ role: "system" as const, content: memory.join("\n\n") }] : [];

    const recent = (stored.messages ?? []).slice(-20).map(m => ({ role: m.role, content: m.content }));
    return [system, ...memoryBlock, ...recent];
  }

  private async applyCommand(cmd: ServerCommand): Promise<ClientEvent | { ok: true }> {
    const stored = await this.readState();

    if (cmd.type === "set_profile") {
      stored.profile = { ...(stored.profile ?? {}), ...(cmd.profile ?? {}) };
      await this.writeState(stored);
      this.broadcast({ type: "state", messages: stored.messages ?? [], summary: stored.summary });
      return { ok: true };
    }

    if (cmd.type === "save_notes") {
      stored.notes = (cmd.notes ?? "").slice(0, 20_000);
      await this.writeState(stored);
      this.broadcast({ type: "state", messages: stored.messages ?? [], summary: stored.summary });
      return { ok: true };
    }

    if (cmd.type === "quiz") {
      const count = Math.max(3, Math.min(10, cmd.count ?? 5));
      const prompt = `Create a ${count}-question quiz based on the user's notes and the conversation. Provide numbered questions only. Mix conceptual and practice questions.`;
      return await this.handleUserMessage(prompt, stored, true);
    }

    if (cmd.type === "message") {
      const content = (cmd.content ?? "").trim();
      if (!content) return { type: "error", message: "Message was empty." };
      return await this.handleUserMessage(content, stored, false);
    }

    return { type: "error", message: "Unknown command." };
  }

  private async handleUserMessage(content: string, stored: StoredState, synthetic: boolean): Promise<ClientEvent> {
    const userMsg: ChatMessage = { role: "user", content, ts: Date.now() };
    if (!synthetic) {
      stored.messages = this.trimMessages([...(stored.messages ?? []), userMsg]);
      await this.writeState(stored);
      this.broadcast({ type: "message", message: userMsg });
    }

    // build context and call LLM
    const messages = this.buildContext(stored);
    messages.push({ role: "user", content });

    let assistantText = "";
    try {
      const resp = await this.env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", { messages });
      assistantText = String((resp as any).response ?? (resp as any).result ?? "").trim();
      if (!assistantText) assistantText = "I couldn't generate a response. Try rephrasing your request.";
    } catch (e) {
      assistantText = "The AI model call failed. Please try again.";
    }

    const asstMsg: ChatMessage = { role: "assistant", content: assistantText, ts: Date.now() };
    stored.messages = this.trimMessages([...(stored.messages ?? []), asstMsg]);

    // optionally summarize on cadence
    const next = await this.maybeSummarize(stored);
    await this.writeState(next);

    this.broadcast({ type: "message", message: asstMsg });
    return { type: "message", message: asstMsg };
  }
}
