export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  ts: number;
};

export type ClientEvent =
  | { type: "hello"; sessionId: string }
  | { type: "message"; message: ChatMessage }
  | { type: "error"; message: string }
  | { type: "state"; messages: ChatMessage[]; summary?: string };

export type ServerCommand =
  | { type: "message"; content: string }
  | { type: "set_profile"; profile: Partial<UserProfile> }
  | { type: "save_notes"; notes: string }
  | { type: "quiz"; count?: number };

export type UserProfile = {
  topic?: string;
  difficulty?: "easy" | "medium" | "hard";
  format?: "short" | "detailed";
};

export type StoredState = {
  messages: ChatMessage[];
  summary?: string;
  notes?: string;
  profile?: UserProfile;
};
