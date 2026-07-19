# Devmind AI

ChatGPT-style assistant with **automatic web search tool calling** and **conversation branching**.

The model can look up live information when needed, stream tool progress and the final answer, and let you fork a chat from any message into an independent branch — while sharing history up to the fork point.

## Features

### Phase 1 — AI tools (web search)

- OpenAI provider-executed `web_search` tool (AI SDK)
- Model decides when to search (`toolChoice: auto`)
- Streamed tool UI (loading → sources / error) then streamed final answer
- Tool calls and results persisted on each message (`Message.parts` JSON)

### Phase 2 — Chat branching

- Create a branch from any message
- Switch between branches from the header
- Rename and delete branches (Main cannot be deleted)
- Branch paths stored as a message tree (`parentId` + `ConversationBranch` head)

### Product polish

- Clerk auth, conversation sidebar, pin/archive/rename chats
- Loading states, toasts, and graceful tool/chat errors
- Responsive shell with collapsible sidebar

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js (App Router) |
| AI | Vercel AI SDK + `@ai-sdk/openai` |
| Auth | Clerk |
| Database | PostgreSQL + Prisma |
| UI | Tailwind CSS, shadcn/ui, React Query |

## Project structure

```text
app/
  api/chat/route.ts          # Streaming chat + tools
  (root)/c/[id]/page.tsx     # Conversation page
features/
  ai/                        # Model, chat store, web_search tool
  conversation/              # Branches, sidebar, chat UI
  auth/                      # Clerk user helpers
prisma/
  schema.prisma              # Conversation, Message, ConversationBranch
```

## Getting started

### 1. Clone and install

```bash
git clone https://github.com/PARTHKHUNTETA/devmind-ai.git
cd devmind-ai
npm install
```

### 2. Environment variables

```bash
cp .env.example .env
```

Fill in values from [`.env.example`](./.env.example):

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key |
| `CLERK_SECRET_KEY` | Clerk secret key |
| `OPENAI_API_KEY` | OpenAI key (chat + web search) |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | Sign-in path (default `/sign-in`) |
| `NEXT_PUBLIC_CLERK_*_FALLBACK_REDIRECT_URL` | Post-auth redirects |

In the [Clerk dashboard](https://dashboard.clerk.com), allow your local origin (`http://localhost:3000`) and production domain.

### 3. Database

```bash
npx prisma migrate deploy
npx prisma generate
```

For local iteration you can also use:

```bash
npx prisma migrate dev
```

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## How it works

### Web search tool calling

1. Client sends the latest user message to `POST /api/chat`.
2. Server loads the **active branch** message path and calls `streamText` with `webSearchTools`.
3. If the model needs fresh data, it invokes `web_search`; the UI shows `WebSearchPart` while the tool runs.
4. On stream end, assistant messages (including tool parts) are saved via `saveChatMessages`.

### Conversation branching

Messages form a tree via `parentId`. Each `ConversationBranch` stores:

- `forkFromMessageId` — where the branch split
- `headMessageId` — tip of that branch’s path

Creating a branch from message **M** sets the active head to **M**. New replies continue that path only. Switching branches reloads the path from that branch’s head.

## Scripts

```bash
npm run dev      # development
npm run build    # production build
npm run start    # run production server
npm run lint     # ESLint
```

## Deployment

Recommended: [Vercel](https://vercel.com) + hosted Postgres (e.g. Neon) + Clerk production instance.

1. Push this repo to GitHub (public for submission).
2. Import the project in Vercel.
3. Set the same env vars as `.env.example` in the Vercel project settings.
4. Ensure `prisma migrate deploy` runs on build (or run migrations against production once).
5. Add the production URL to Clerk allowed origins / redirect URLs.

**Live demo:** _add your deployment URL here_  
**Demo video:** _add your Loom / YouTube / Drive link here_

## Submission checklist

Use this before turning in the assignment:

- [ ] GitHub repository is **public**
- [ ] All feature work is **committed and pushed** (including local branching UI fixes)
- [ ] App is **deployed**; README links the live URL
- [ ] **Demo video** recorded and linked in this README
- [ ] README documents setup, env vars, and features (this file)
- [ ] `.env.example` is present; no real secrets in git
- [ ] Smoke-test: web search streams + persists; create / switch / rename / delete branches

### Demo video suggested script (2–3 min)

1. Ask a current-events question → show search loading, sources, then answer.
2. Reload the chat → show the search block still present (persistence).
3. Branch from a mid-thread message → ask a different follow-up.
4. Switch back to Main → show independent histories.
5. Rename a branch; delete a non-Main branch.

## License

Private coursework project unless otherwise noted.
