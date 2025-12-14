import { ChatSessionDO } from "./durable-objects/ChatSessionDO";

export { ChatSessionDO };

type Env = {
  AI: Ai;
  CHAT_DO: DurableObjectNamespace;
};

function corsHeaders(origin: string | null) {
  const allowOrigin = origin ?? "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(request.headers.get("Origin")) });
    }

    // Simple health check
    if (url.pathname === "/health") {
      return Response.json({ ok: true, name: "cf-ai-study-buddy" }, { headers: corsHeaders(request.headers.get("Origin")) });
    }

    // Session routing: /session/<id>/...
    // If no session id provided, create one
    if (url.pathname === "/session/new") {
      const id = env.CHAT_DO.newUniqueId();
      return Response.json({ sessionId: id.toString(), url: `/session/${id.toString()}/ws` }, { headers: corsHeaders(request.headers.get("Origin")) });
    }

    const m = url.pathname.match(/^\/session\/([^/]+)(\/.*)?$/);
    if (m) {
      const sessionId = m[1];
      const subpath = m[2] || "/";
      const id = env.CHAT_DO.idFromString(sessionId);
      const stub = env.CHAT_DO.get(id);

      // forward to DO
      const forwardUrl = new URL(request.url);
      forwardUrl.pathname = subpath;

      const resp = await stub.fetch(forwardUrl.toString(), request);
      // ensure CORS for non-ws
      const isWs = request.headers.get("Upgrade") === "websocket";
      if (isWs) return resp;

      const headers = new Headers(resp.headers);
      for (const [k, v] of Object.entries(corsHeaders(request.headers.get("Origin")))) headers.set(k, v);
      return new Response(resp.body, { status: resp.status, headers });
    }

    return new Response("Not found. Use /session/new", { status: 404, headers: corsHeaders(request.headers.get("Origin")) });
  },
};
