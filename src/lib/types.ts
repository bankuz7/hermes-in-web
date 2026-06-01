export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number; // epoch ms
};

export type Conversation = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
};

export type AuthMode = "bearer" | "x-api-key" | "none";

export type AppSettings = {
  endpointBaseUrl: string; // e.g. https://api.example.com
  chatCompletionsPath: string; // default: /v1/chat/completions
  apiKey: string;
  authMode: AuthMode;
  model: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  stream: boolean;
};
