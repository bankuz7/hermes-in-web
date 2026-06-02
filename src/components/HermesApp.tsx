"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AppSettings, ChatMessage, Conversation } from "@/lib/types";
import { DEFAULT_SETTINGS, loadConversations, loadSettings, saveConversations, saveSettings } from "@/lib/storage";
import { fetchModels, sendChat } from "@/lib/llm";
import { cn, uid } from "@/lib/utils";

function now() {
  return Date.now();
}

function newConversation(): Conversation {
  const id = uid("convo");
  const t = now();
  return {
    id,
    title: "New chat",
    createdAt: t,
    updatedAt: t,
    messages: [],
  };
}

function truncateTitle(text: string) {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) return "New chat";
  return t.length > 36 ? `${t.slice(0, 36)}…` : t;
}

export default function HermesApp() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [input, setInput] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>("");
  const [models, setModels] = useState<{ id: string; owned_by: string }[]>([]);
  const [modelsFromApi, setModelsFromApi] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setSettings(loadSettings());
    const loaded = loadConversations();
    if (loaded.length) {
      setConvos(loaded);
      setActiveId(loaded[0]!.id);
    } else {
      const c = newConversation();
      setConvos([c]);
      setActiveId(c.id);
      saveConversations([c]);
    }
  }, []);

  useEffect(() => {
    if (!settings.endpointBaseUrl || !settings.apiKey) return;
    const ac = new AbortController();
    fetchModels(settings)
      .then((list) => {
        setModels(list);
        // If we got 32 models, it's the hardcoded list (CORS blocked)
        setModelsFromApi(list.length > 32);
      })
      .catch(() => {
        setModels([]);
      });
    return () => ac.abort();
  }, [settings.endpointBaseUrl, settings.apiKey]);

  const active = useMemo(() => convos.find((c) => c.id === activeId) ?? null, [convos, activeId]);

  function persist(nextSettings: AppSettings) {
    setSettings(nextSettings);
    saveSettings(nextSettings);
  }

  function persistConvos(next: Conversation[]) {
    setConvos(next);
    saveConversations(next);
  }

  function updateActive(patch: Partial<Conversation>) {
    if (!active) return;
    const next = convos.map((c) => (c.id === active.id ? { ...c, ...patch, updatedAt: now() } : c));
    persistConvos(next);
  }

  function addMessage(msg: ChatMessage) {
    if (!active) return;
    const next = convos.map((c) =>
      c.id === active.id ? { ...c, messages: [...c.messages, msg], updatedAt: now() } : c
    );
    persistConvos(next);
  }

  function setAssistantMessage(id: string, content: string) {
    if (!active) return;
    const next = convos.map((c) => {
      if (c.id !== active.id) return c;
      return {
        ...c,
        messages: c.messages.map((m) => (m.id === id ? { ...m, content } : m)),
        updatedAt: now(),
      };
    });
    persistConvos(next);
  }

  function onNewChat() {
    const c = newConversation();
    const next = [c, ...convos];
    persistConvos(next);
    setActiveId(c.id);
    setError("");
    setInput("");
  }

  function onDeleteChat(id: string) {
    const next = convos.filter((c) => c.id !== id);
    persistConvos(next.length ? next : [newConversation()]);
    if (activeId === id) {
      setActiveId((next.length ? next : loadConversations())[0]!.id);
    }
  }

  async function onSend() {
    if (!active) return;
    const text = input.trim();
    if (!text) return;

    setError("");
    setBusy(true);

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const userMsg: ChatMessage = { id: uid("m"), role: "user", content: text, createdAt: now() };
    addMessage(userMsg);
    setInput("");

    if (active.messages.length === 0) {
      updateActive({ title: truncateTitle(text) });
    }

    const assistantId = uid("m");
    const assistantMsg: ChatMessage = { id: assistantId, role: "assistant", content: "", createdAt: now() };
    addMessage(assistantMsg);

    try {
      const baseMessages = [...active.messages, userMsg, assistantMsg];
      let acc = "";
      const reply = await sendChat(
        settings,
        baseMessages,
        {
          signal: abortRef.current.signal,
          onToken: (t) => {
            acc += t;
            setAssistantMessage(assistantId, acc);
          },
        }
      );

      // In case streaming was off
      if (reply && !settings.stream) {
        setAssistantMessage(assistantId, reply);
      }
    } catch (e: any) {
      const msg = e?.message ? String(e.message) : "Request failed";
      setError(msg);
      setAssistantMessage(assistantId, `Error: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  function onStop() {
    abortRef.current?.abort();
    setBusy(false);
  }

  const settingsMissing = !settings.endpointBaseUrl || !settings.model;

  return (
    <div className="min-h-[100dvh] bg-zinc-50 text-zinc-900">
      <div className="mx-auto flex w-full max-w-6xl flex-col px-4 py-6 md:py-10">
        <header className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-zinc-900 text-zinc-50 grid place-items-center font-semibold">
              H
            </div>
            <div>
              <div className="text-sm font-semibold">Hermes in Web</div>
              <div className="text-xs text-zinc-500">Browser-only AI chat (OpenAI-compatible)</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onNewChat}
              className="h-9 rounded-full bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800"
            >
              New chat
            </button>
            {busy ? (
              <button
                onClick={onStop}
                className="h-9 rounded-full border border-zinc-200 bg-white px-4 text-sm font-medium hover:bg-zinc-50"
              >
                Stop
              </button>
            ) : null}
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-[280px_1fr]">
          <aside className="rounded-2xl border border-zinc-200 bg-white p-3">
            <div className="mb-2 px-2 text-xs font-semibold text-zinc-500">CHATS</div>
            <div className="flex flex-col gap-1">
              {convos.map((c) => (
                <div key={c.id} className={cn("group flex items-center gap-2 rounded-xl px-2 py-2", c.id === activeId ? "bg-zinc-100" : "hover:bg-zinc-50")}>
                  <button
                    onClick={() => setActiveId(c.id)}
                    className="flex-1 truncate text-left text-sm"
                    title={c.title}
                  >
                    {c.title}
                  </button>
                  <button
                    onClick={() => onDeleteChat(c.id)}
                    className="opacity-0 group-hover:opacity-100 text-xs text-zinc-400 hover:text-zinc-900"
                    title="Delete chat"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </aside>

          <main className="rounded-2xl border border-zinc-200 bg-white p-4 md:p-6">
            <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-zinc-200 p-4">
                <div className="mb-2 text-xs font-semibold text-zinc-500">SETTINGS</div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-zinc-600">Endpoint Base URL</label>
                  <input
                    value={settings.endpointBaseUrl}
                    onChange={(e) => persist({ ...settings, endpointBaseUrl: e.target.value })}
                    placeholder="https://api.your-llm.com"
                    className="h-10 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                  />

                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <div>
                      <label className="text-xs text-zinc-600">Auth mode</label>
                      <select
                        value={settings.authMode}
                        onChange={(e) => persist({ ...settings, authMode: e.target.value as any })}
                        className="mt-1 h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                      >
                        <option value="bearer">Bearer</option>
                        <option value="x-api-key">x-api-key</option>
                        <option value="none">None</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-zinc-600">API key</label>
                      <input
                        value={settings.apiKey}
                        onChange={(e) => persist({ ...settings, apiKey: e.target.value })}
                        placeholder="stored in your browser"
                        className="mt-1 h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <div>
                                        <label className="text-xs text-zinc-600">Model</label>
                                        <select
                                          value={settings.model}
                                          onChange={(e) => persist({ ...settings, model: e.target.value })}
                                          className="mt-1 h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                                        >
                                          {models.length > 0 ? (
                                            models.map((m) => (
                                              <option key={m.id} value={m.id}>
                                                {m.id} ({m.owned_by})
                                              </option>
                                            ))
                                          ) : (
                                            <option value="">No models fetched</option>
                                          )}
                                        </select>
                                        <div className="mt-1 text-xs text-zinc-500">
                                          {settings.endpointBaseUrl && settings.apiKey ? (
                                            modelsFromApi ? (
                                              <span className="text-green-600">✓ {models.length} models fetched from API</span>
                                            ) : (
                                              <span className="text-amber-600">⚠ {models.length} popular models shown (API blocked by CORS)</span>
                                            )
                                          ) : (
                                            <span className="text-amber-600">Enter endpoint + API key to fetch models</span>
                                          )}
                                        </div>
                                      </div>
                    <div>
                      <label className="text-xs text-zinc-600">Chat path</label>
                      <input
                        value={settings.chatCompletionsPath}
                        onChange={(e) => persist({ ...settings, chatCompletionsPath: e.target.value })}
                        placeholder="/v1/chat/completions"
                        className="mt-1 h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                      />
                    </div>
                  </div>

                  <label className="text-xs text-zinc-600">System prompt</label>
                  <textarea
                    value={settings.systemPrompt}
                    onChange={(e) => persist({ ...settings, systemPrompt: e.target.value })}
                    className="min-h-[88px] rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                  />

                  <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                    <div>
                      <label className="text-xs text-zinc-600">Temperature</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="2"
                        value={settings.temperature}
                        onChange={(e) => persist({ ...settings, temperature: Number(e.target.value) })}
                        className="mt-1 h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-600">Max tokens</label>
                      <input
                        type="number"
                        min="1"
                        value={settings.maxTokens}
                        onChange={(e) => persist({ ...settings, maxTokens: Number(e.target.value) })}
                        className="mt-1 h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                      />
                    </div>
                    <div className="flex items-end gap-2">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={settings.stream}
                          onChange={(e) => persist({ ...settings, stream: e.target.checked })}
                        />
                        Stream
                      </label>
                    </div>
                  </div>

                  {settingsMissing ? (
                    <div className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      Fill Endpoint Base URL + Model. Example endpoint:
                      <div className="mt-1 font-mono">https://YOUR-ENDPOINT</div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-200 p-4">
                <div className="mb-2 text-xs font-semibold text-zinc-500">ABOUT (browser-only)</div>
                <ul className="list-disc pl-5 text-sm text-zinc-700 space-y-2">
                  <li>
                    Runs entirely in your browser. Messages + API key are stored in <span className="font-mono">localStorage</span>.
                  </li>
                  <li>
                    Connects to an <span className="font-medium">OpenAI-compatible</span> Chat Completions endpoint.
                  </li>
                  <li>
                    If your endpoint blocks CORS, you must enable CORS on the provider side (no backend proxy here).
                  </li>
                </ul>

                {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">{error}</div> : null}
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200">
              <div className="border-b border-zinc-200 px-4 py-3 text-sm font-medium">{active?.title ?? "Chat"}</div>
              <div className="max-h-[52vh] overflow-auto px-4 py-4">
                <div className="flex flex-col gap-3">
                  {(active?.messages ?? []).length === 0 ? (
                    <div className="text-sm text-zinc-500">Send a message to start.</div>
                  ) : null}

                  {(active?.messages ?? []).map((m) => (
                    <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                      <div
                        className={cn(
                          "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6",
                          m.role === "user" ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-900"
                        )}
                      >
                        <div className="whitespace-pre-wrap">{m.content}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-t border-zinc-200 p-3">
                <div className="flex items-end gap-2">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Type your message..."
                    className="min-h-[44px] flex-1 resize-none rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (!busy) onSend();
                      }
                    }}
                    disabled={busy}
                  />
                  <button
                    onClick={onSend}
                    disabled={busy}
                    className={cn(
                      "h-11 rounded-2xl px-5 text-sm font-medium",
                      busy ? "bg-zinc-200 text-zinc-500" : "bg-zinc-900 text-white hover:bg-zinc-800"
                    )}
                  >
                    Send
                  </button>
                </div>
                <div className="mt-2 text-xs text-zinc-500">Enter = send, Shift+Enter = newline</div>
              </div>
            </div>
          </main>
        </div>

        <footer className="mt-8 text-center text-xs text-zinc-500">
          Hermes in Web   {new Date().getFullYear()}   No server required
        </footer>
      </div>
    </div>
  );
}
