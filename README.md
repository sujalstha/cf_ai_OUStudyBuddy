A small AI-powered chat app designed to satisfy Cloudflare’s AI app assignment requirements:
- **LLM**: Workers AI (recommended model: Llama 3.3)
- **Workflow/Coordination**: Durable Objects coordinate sessions and WebSocket fan-out
- **User input**: Web chat UI served via Pages
- **Memory/State**: session messages + notes + preferences persisted in Durable Object storage

## Architecture
- **Cloudflare Pages**: static web UI (`/pages/index.html`)
- **Cloudflare Worker**: routes session requests and creates new sessions (`/src/worker.ts`)
- **Durable Object**: `ChatSessionDO` stores memory/state and runs the AI calls (`/src/durable-objects/ChatSessionDO.ts`)
- **Workers AI**: invoked from the Durable Object via `env.AI.run(...)`

## Features
- Real-time chat via WebSockets (DO acts as the session hub)
- Session memory (last ~40 messages stored + rolling summary cadence)
- Notes panel (stored server-side as memory context per session)
- Quiz generation based on your notes and recent conversation

## Prerequisites
- Node.js 18+
- Cloudflare account
- Wrangler installed (included as a dev dependency)

## Setup
```bash
npm install
```

Login Wrangler:
```bash
npx wrangler login
```

## Local dev (Worker + Durable Objects)
```bash
npm run dev
```

Wrangler will print a local URL (or remote preview URL). Open the Pages UI with a local static server:
```bash
# from repo root
npx wrangler pages dev ./pages --compatibility-date=2025-12-01
```

If your Worker origin differs from the Pages dev origin, set this at the top of `pages/index.html`:
- Update `WORKER_ORIGIN` to point to your Worker dev URL.

## Deploy (Worker)
```bash
npm run deploy
```

## Deploy (Pages)
```bash
npm run pages:deploy
```

## API endpoints
- `GET /health`
- `GET /session/new` -> returns `{ sessionId, url }`
- `GET /session/<id>/ws` -> websocket chat
- `GET /session/<id>/state` -> debug read state

## Notes about “Memory”
This app keeps:
- A bounded message window (last 40 messages)
- Optional rolling summary (every 12 messages) stored in the DO
- Notes and user preferences stored in the DO

## What I’d build next (if I had more time)
- Streaming tokens to the UI (better perceived latency)
- Content moderation / safety filtering
- Rate-limiting and abuse prevention
- Multiple “rooms” per user and basic auth
- Optional voice input using Cloudflare Realtime

