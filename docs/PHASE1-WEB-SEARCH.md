# Phase 1 — AI Tools (Web Search)

This document explains how **automatic web search tool calling** is implemented in Devmind AI: what was built, how it works end-to-end, and which files changed.

## Goal

Large language models only know their training data. Phase 1 lets the model **decide** when it needs live information, call a **web search tool**, stream that tool activity to the UI, then continue generating the final answer using the retrieved data — so the user feels the AI naturally searched the web before answering.

## Requirements covered

| Requirement | How it is met |
| --- | --- |
| Integrate at least one web search tool | OpenAI provider tool `web_search` via AI SDK |
| LLM decides when to call the tool | Default `toolChoice: "auto"` + system prompt guidance |
| Stream tool execution and final response | `streamText` → `toUIMessageStream` / UI message parts |
| Store tool calls and tool responses | Persisted in `Message.parts` JSON |
| Loading and error states | `WebSearchPart` UI + route `onError` + client toasts |

## Architecture overview

```text
User message
    → POST /api/chat
    → load active-branch history
    → streamText({ tools: webSearchTools })
         ├─ (optional) web_search tool call  → streamed as tool UI parts
         └─ assistant text                   → streamed as text parts
    → onEnd: saveChatMessages (parts include tool + text)
    → ChatMessages renders WebSearchPart + markdown answer
```

## How it works (step by step)

1. **Client** sends the latest user message to `POST /api/chat` with the conversation id.
2. **Server** authenticates (Clerk), verifies ownership, loads messages on the **active branch**.
3. **`streamText`** runs with:
   - chat model from `getChatModel`
   - system prompt that tells the model to use `web_search` for current / changing facts
   - `tools: webSearchTools`
   - `stopWhen: stepCountIs(5)` so multi-step tool → answer loops are allowed
4. If the model needs fresh data, it invokes **`web_search`**. OpenAI executes the search (provider-executed tool).
5. Tool progress streams to the client as AI SDK **tool UI parts** (`input-streaming` → `input-available` → `output-available` or `output-error`).
6. The model then generates the **final answer**, also streamed.
7. When the stream ends, **`saveChatMessages`** upserts assistant messages. Full `parts` (tool + text) are stored in Postgres so a reload still shows the search UI.

## Key implementation details

### Tool definition

`features/ai/tools/web-search.ts` exports:

```ts
export const webSearchTools = {
  web_search: openai.tools.webSearch({
    searchContextSize: "medium",
  }),
} as const;
```

The tool key must be `web_search` so streamed tool names match the OpenAI Responses API tool.

### Chat API wiring

`app/api/chat/route.ts`:

- Registers `webSearchTools` on both `convertToModelMessages` and `streamText`
- System prompt encourages search for current events and citing sources
- `onError` maps `NoSuchToolError` / `InvalidToolInputError` to safe user messages
- `onEnd` persists final messages (including tool parts)

### Persistence

- Table: `Message`
- Columns used: `content` (plain text) + **`parts` (JSON)** for structured AI SDK parts
- Tool invocations are **not** separate rows; they live inside the assistant message’s `parts` array
- Reload path: `loadChatMessages` → `toUIMessageParts` restores tool UI on refresh

### UI

| File | Role |
| --- | --- |
| `features/conversation/components/web-search-part.tsx` | Collapsible “Searching the web…” / sources / error |
| `features/conversation/components/chat-messages.tsx` | Renders `WebSearchPart` for `web_search` tool parts |
| `features/conversation/components/conversation-view.tsx` | `useChat` streaming + `onError` toast |

Loading states:

- Spinner while `part.state` is `input-streaming` or `input-available`
- Sources list when `output-available`
- Destructive styling + `errorText` when `output-error`

## Files changed / added (Phase 1)

### Added

| Path | Purpose |
| --- | --- |
| `features/ai/tools/web-search.ts` | Web search tool export |
| `features/conversation/components/web-search-part.tsx` | Tool call UI (loading / results / error) |

### Updated (tool-related)

| Path | Change |
| --- | --- |
| `app/api/chat/route.ts` | Wire tools, system prompt, stream errors, persist parts |
| `features/ai/actions/chat-store.ts` | Save/load `parts` JSON with messages |
| `features/conversation/components/chat-messages.tsx` | Render tool parts via `WebSearchPart` |
| `features/ai/utils/model.ts` | Chat model helper used by the route |
| `prisma/schema.prisma` | `Message.parts` / `MessageRole.TOOL` support for structured messages |

### Supporting stack

- `ai` / `@ai-sdk/openai` / `@ai-sdk/react` for streaming tool UI
- `OPENAI_API_KEY` required in env (see `.env.example`)

## Manual test plan

1. Ask something time-sensitive (e.g. “What happened in tech news today?”).
2. Confirm the UI shows **Searching the web…**, then sources or a completed search chip.
3. Confirm the assistant answer cites or uses that information.
4. Reload the conversation — search UI should still appear (persistence).
5. Force a failure scenario (e.g. invalid key in a private test) — error state / toast should appear without crashing the page.

## Notes for evaluators

- Tool calling is **model-driven** (auto), not a hard-coded “always search” button.
- Streaming covers **both** tool execution and the final text answer.
- Database persistence of tool calls/responses is via **`Message.parts`**, which is the AI SDK’s natural persistence shape.
