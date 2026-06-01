import type { AppSettings, ChatMessage } from "./types";

export type LlmModelInfo = {
  id: string;
  owned_by: string;
};

export type LlmSendOptions = {
  signal?: AbortSignal;
  onToken?: (text: string) => void;
};

type OpenAIChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

function buildAuthHeaders(settings: AppSettings): Record<string, string> {
  if (!settings.apiKey || settings.authMode === "none") return {};
  if (settings.authMode === "bearer") {
    return { Authorization: `Bearer ${settings.apiKey}` };
  }
  if (settings.authMode === "x-api-key") {
    return { "x-api-key": settings.apiKey };
  }
  return {};
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

function normalizePath(path: string) {
  if (!path.startsWith("/")) return `/${path}`;
  return path;
}

function toOpenAiMessages(messages: ChatMessage[], systemPrompt: string): OpenAIChatMessage[] {
  const out: OpenAIChatMessage[] = [];
  if (systemPrompt.trim()) out.push({ role: "system", content: systemPrompt.trim() });
  for (const m of messages) {
    if (m.role === "system") continue;
    out.push({ role: m.role, content: m.content });
  }
  return out;
}

export async function sendChat(
  settings: AppSettings,
  messages: ChatMessage[],
  opts: LlmSendOptions = {}
): Promise<string> {
  const base = normalizeBaseUrl(settings.endpointBaseUrl);
  const path = normalizePath(settings.chatCompletionsPath);
  const url = `${base}${path}`;

  if (!settings.endpointBaseUrl) throw new Error("Set Endpoint Base URL in Settings.");
  if (!settings.model) throw new Error("Set a model name in Settings.");

  const body = {
    model: settings.model,
    messages: toOpenAiMessages(messages, settings.systemPrompt),
    temperature: settings.temperature,
    max_tokens: settings.maxTokens,
    stream: settings.stream,
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...buildAuthHeaders(settings),
  };

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: opts.signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText}${text ? ` — ${text}` : ""}`);
  }

  // Non-stream fallback
  if (!settings.stream) {
    const data = (await res.json()) as any;
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("Unexpected response shape.");
    return content;
  }

  // Stream: OpenAI-style SSE: lines beginning with 'data:'
  const reader = res.body?.getReader();
  if (!reader) throw new Error("Streaming not supported by this browser/response.");

  const decoder = new TextDecoder();
  let acc = "";
  let buf = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    const lines = buf.split(/\r?\n/);
    buf = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice("data:".length).trim();
      if (payload === "[DONE]") {
        buf = "";
        break;
      }
      try {
        const json = JSON.parse(payload);
        const delta =
          json?.choices?.[0]?.delta?.content ??
          json?.choices?.[0]?.message?.content ??
          "";
        if (typeof delta === "string" && delta) {
          acc += delta;
          opts.onToken?.(delta);
        }
      } catch {
        // ignore malformed chunks
      }
    }
  }

  return acc;
}

export async function fetchModels(settings: AppSettings): Promise<LlmModelInfo[]> {
  const base = normalizeBaseUrl(settings.endpointBaseUrl);
  const modelsPath = "/v1/models"; // Standard OpenAI-compatible path
  const url = `${base}${modelsPath}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...buildAuthHeaders(settings),
  };

  const res = await fetch(url, {
    method: "GET",
    headers,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText}${text ? ` — ${text}` : ""}`);
  }

  const data = (await res.json()) as { data: LlmModelInfo[] };
  if (!Array.isArray(data?.data)) {
    throw new Error("Unexpected response shape from /v1/models");
  }

  return data.data;
}