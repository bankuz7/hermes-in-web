# Hermes in Web

A **browser-only** Hermes AI agent UI built with **React (Next.js App Router)**.

- No backend/server required.
- Connects to any **OpenAI-compatible** Chat Completions endpoint (provider #4 / custom endpoint).
- Stores settings + chats in your browser (`localStorage`).

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Configure

In the app **Settings** panel:

- **Endpoint Base URL**: e.g. `https://YOUR-ENDPOINT`
- **Chat path**: default `/v1/chat/completions`
- **Auth mode**: `Bearer` or `x-api-key`
- **API key**: stored locally in your browser
- **Model**: your model name

## Notes (important)

- Because this is browser-only, your provider must allow **CORS**.
- Don’t put secret API keys in GitHub. The key stays in your browser storage.
