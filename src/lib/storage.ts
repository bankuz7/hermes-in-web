import type { AppSettings, Conversation } from "./types";

const SETTINGS_KEY = "hermes_in_web_settings_v1";
const CONVERSATIONS_KEY = "hermes_in_web_conversations_v1";

export const DEFAULT_SETTINGS: AppSettings = {
  endpointBaseUrl: "",
  chatCompletionsPath: "/v1/chat/completions",
  apiKey: "",
  authMode: "bearer",
  model: "gpt-4o-mini",
  systemPrompt:
    "You are Hermes, a helpful AI agent running fully in the browser. Keep answers concise and practical.",
  temperature: 0.4,
  maxTokens: 800,
  stream: true,
};

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadConversations(): Conversation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CONVERSATIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Conversation[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveConversations(convos: Conversation[]) {
  localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(convos));
}
