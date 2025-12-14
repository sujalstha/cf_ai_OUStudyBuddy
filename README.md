# cf_ai_OUStudyBuddy
An AI-powered study assistant built on Cloudflare. It provides a real-time chat UI where users can paste notes, ask questions, and generate quizzes. The app uses Workers AI (Llama 3.3), Durable Objects for session coordination and memory/state, and a Pages frontend.

## Requirements Checklist (per assignment)
- LLM: Cloudflare Workers AI (Llama 3.3)
- Workflow/coordination: Durable Objects (per-session chat + WebSocket coordination)
- User input: Chat UI (Cloudflare Pages)
- Memory/state: Durable Object storage (chat history + notes + preferences)

## Tech Stack
- Cloudflare Workers (TypeScript)
- Durable Objects (TypeScript)
- Cloudflare Workers AI (Llama 3.3)
- Cloudflare Pages (HTML + JavaScript)

## Project Structure
- `src/` - Worker backend + Durable Object
- `pages/` - Pages frontend (chat UI)
- `wrangler.toml` - Cloudflare configuration
- `PROMPTS.md` - AI prompts used during development

## Local Development

### Prereqs
- Node.js 18+ (recommended)
- Cloudflare Wrangler CLI

Install Wrangler (if you don’t have it):
```bash
npm i -g wrangler
```

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

