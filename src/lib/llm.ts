import type { AppSettings, ChatMessage } from "./types";

export type LlmModelInfo = {
  id: string;
  owned_by: string;
};

/** NVIDIA NIM models — used as fallback when /v1/models is blocked by CORS */
export const NVIDIA_NIM_MODELS: LlmModelInfo[] = [
  { id: "minimaxai/minimax-m2.7", owned_by: "minimaxai" },
  { id: "z-ai/glm-5.1", owned_by: "z-ai" },
  { id: "meta/llama-3.3-70b-instruct", owned_by: "meta" },
  { id: "meta/llama-3.1-70b-instruct", owned_by: "meta" },
  { id: "meta/llama-3.1-8b-instruct", owned_by: "meta" },
  { id: "mistralai/mistral-large-3-675b-instruct-2512", owned_by: "mistralai" },
  { id: "mistralai/mistral-large-2-instruct", owned_by: "mistralai" },
  { id: "mistralai/mistral-small-4-119b-2603", owned_by: "mistralai" },
  { id: "nvidia/llama-3.1-nemotron-70b-instruct", owned_by: "nvidia" },
  { id: "nvidia/llama-3.1-nemotron-nano-8b-v1", owned_by: "nvidia" },
  { id: "nvidia/llama-3.1-nemotron-ultra-253b-v1", owned_by: "nvidia" },
  { id: "nvidia/llama-3.3-nemotron-super-49b-v1.5", owned_by: "nvidia" },
  { id: "nvidia/nemotron-4-340b-instruct", owned_by: "nvidia" },
  { id: "nvidia/nemotron-nano-3-30b-a3b", owned_by: "nvidia" },
  { id: "qwen/qwen3.5-397b-a17b", owned_by: "qwen" },
  { id: "qwen/qwen3.5-122b-a10b", owned_by: "qwen" },
  { id: "qwen/qwen3-next-80b-a3b-instruct", owned_by: "qwen" },
  { id: "google/gemma-3-12b-it", owned_by: "google" },
  { id: "google/gemma-4-31b-it", owned_by: "google" },
  { id: "deepseek-ai/deepseek-v4-pro", owned_by: "deepseek-ai" },
  { id: "deepseek-ai/deepseek-v4-flash", owned_by: "deepseek-ai" },
  { id: "moonshotai/kimi-k2.6", owned_by: "moonshotai" },
  { id: "microsoft/phi-4-multimodal-instruct", owned_by: "microsoft" },
  { id: "microsoft/phi-4-mini-instruct", owned_by: "microsoft" },
  { id: "mistralai/codestral-22b-instruct-v0.1", owned_by: "mistralai" },
  { id: "mistralai/mistral-nemotron", owned_by: "mistralai" },
  { id: "meta/llama-3.2-90b-vision-instruct", owned_by: "meta" },
  { id: "meta/llama-4-maverick-17b-128e-instruct", owned_by: "meta" },
  { id: "snowflake/arctic-embed-l", owned_by: "snowflake" },
  { id: "stepfun-ai/step-3.7-flash", owned_by: "stepfun-ai" },
  { id: "01-ai/yi-large", owned_by: "01-ai" },
  { id: "databricks/dbrx-instruct", owned_by: "databricks" },
];

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
  if (!settings.model) throw new Error("Set a model name in Settings.");

  const body = {
    model: settings.model,
    messages: toOpenAiMessages(messages, settings.systemPrompt),
    temperature: settings.temperature,
    max_tokens: settings.maxTokens,
    stream: settings.stream,
  };

  // Always call our own proxy — this avoids CORS issues entirely.
  // The proxy lives at same origin (localhost:3000 or vercel.app)
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (settings.apiKey) {
    headers["x-nim-api-key"] = settings.apiKey;
  }

  const res = await fetch("/api/chat", {
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
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (settings.apiKey) {
    headers["x-nim-api-key"] = settings.apiKey;
  }

  try {
    // Call our own proxy at same origin — no CORS issues
    const res = await fetch("/api/models", { method: "GET", headers });
    if (!res.ok) {
      return NVIDIA_NIM_MODELS;
    }
    const data = (await res.json()) as { data: LlmModelInfo[] };
    if (Array.isArray(data?.data) && data.data.length > 0) {
      return data.data;
    }
    return NVIDIA_NIM_MODELS;
  } catch {
    return NVIDIA_NIM_MODELS;
  }
}