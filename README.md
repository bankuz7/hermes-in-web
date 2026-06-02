# Hermes in Web

A **browser-only** Hermes AI agent UI built with **React (Next.js App Router)**.

- Connects to **NVIDIA NIM** via a Vercel serverless proxy (no CORS issues).
- Stores settings + chats in your browser (`localStorage`).
- Deploys automatically to Vercel on every push to `main`.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Configure

In the app **Settings** panel:

- **API key** — your NVIDIA NIM key (`nvapi-...`), stored locally in browser
- **Model** — select from 32 popular models or type any NIM model ID
- **System prompt** — customize behavior
- **Temperature / Max tokens / Stream** — fine-tune responses

> Endpoint and auth settings are auto-configured via the built-in Vercel proxy. No manual setup needed.

## Architecture

```
Browser → /api/chat (Vercel, same-origin) → NVIDIA NIM /v1/chat/completions
Browser → /api/models (Vercel, same-origin) → NVIDIA NIM /v1/models
```

The Vercel serverless proxy forwards requests to NVIDIA NIM — this bypasses CORS restrictions that would block direct browser-to-NIM communication.

## Notes

- Get your NVIDIA NIM API key at [build.nvidia.com](https://build.nvidia.com)
- Your API key never leaves your browser — it is sent only to the Vercel proxy
- Don't commit API keys to GitHub