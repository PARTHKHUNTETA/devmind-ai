# Phase 2 — Chat Branching

This document explains how **conversation branching** is implemented in Devmind AI: what was built, how history is shared until the fork, and which files changed.

## Goal

Users should continue a chat from **any previous message** without losing the original thread. Each branch keeps its own continuation while **sharing ancestors** up to the branching point (no full copy of history).

## Requirements covered

| Requirement | How it is met |
| --- | --- |
| Create a branch from any message | Per-message “Branch from here” action |
| View and switch between branches | Header `BranchSwitcher` dropdown |
| Persist branch history | `ConversationBranch` + message tree (`parentId`) |
| Rename / delete branches | Server actions + UI (Main cannot be deleted) |
| Clean branch navigation UI | Switcher + hover action on messages |

## Data model

Branching uses a **message tree**, not duplicated message rows.

### `Message`

- `parentId` — link to the previous message on the path (forms a tree)
- Shared ancestors stay as single rows; new replies after a fork get new children

### `ConversationBranch`

| Field | Meaning |
| --- | --- |
| `name` | Display name (`Main`, `Branch 2`, …) |
| `forkFromMessageId` | Message where this branch split |
| `headMessageId` | Tip of this branch’s visible path |
| `conversationId` | Parent conversation |

### `Conversation`

- `activeBranchId` — which branch the user is currently chatting on

### Migration

- `prisma/migrations/20260719110000_chat_branching/migration.sql`
  - Adds `activeBranchId`, `parentId`, `ConversationBranch`
  - Backfills parent chains and a **Main** branch per existing conversation

## Architecture overview

```text
Conversation
  ├── activeBranchId → ConversationBranch (current)
  └── branches[]
        ├── Main     head → latest on main path
        └── Branch N head → tip of forked path
              forkFrom → message M

Messages (tree via parentId):
  A → B → C → D          (Main continues to D)
           ↘ E → F       (Branch forked from C)
```

Visible history for a branch = path from root → `headMessageId`, resolved by walking `parentId` links (`resolvePath`).

## How it works (step by step)

### Create a branch from a message

1. User clicks **Branch from here** on message **M**.
2. `createBranchFromMessage(conversationId, messageId)`:
   - Creates a `ConversationBranch` with `forkFromMessageId = M`, `headMessageId = M`
   - Sets `Conversation.activeBranchId` to the new branch
3. UI replaces the message list with the path ending at **M** (shared history only).
4. New replies append children after **M** and advance that branch’s `headMessageId`.

### Switch branches

1. User picks another branch in `BranchSwitcher`.
2. `switchBranch` updates `activeBranchId` and returns messages from `loadChatMessages(..., branchId)`.
3. `ConversationView` remounts chat state with a `chatId` of `conversationId:branchId` so streams don’t collide.

### Rename / delete

- **Rename:** `renameBranch` updates `name` (empty names rejected).
- **Delete:** `deleteBranch`:
  - Blocks deleting the only branch or a branch named `Main`
  - Falls back active branch to Main (or oldest remaining)
  - Prunes message rows that are **not** on any remaining branch path

### Sending messages on a branch

`POST /api/chat`:

1. Resolves `getActiveBranch(conversationId)`
2. Loads that branch’s path
3. Saves the user message with `parentId = headMessageId`, `branchId = active`
4. After streaming, saves assistant messages and advances the branch head

## Key implementation details

### Path resolution

`features/ai/utils/message-tree.ts` — `resolvePath(byId, headMessageId)` walks parents until the root and returns oldest → newest.

### Chat store

`features/ai/actions/chat-store.ts`:

- `ensureMainBranch` / `getActiveBranch` — safety net for older rows
- `loadChatMessages(conversationId, branchId?)` — path for a branch
- `saveChatMessages` — chains `parentId` across a batch and updates `headMessageId`

### Server actions

`features/conversation/actions/branch-actions.ts`:

| Action | Behavior |
| --- | --- |
| `listBranches` | All branches for a conversation |
| `createBranchFromMessage` | Fork + activate |
| `switchBranch` | Change active branch + return path |
| `renameBranch` | Rename |
| `deleteBranch` | Delete + prune orphans + fallback active |

### UI

| File | Role |
| --- | --- |
| `features/conversation/components/branch-switcher.tsx` | View / switch / rename / delete |
| `features/conversation/components/chat-messages.tsx` | Branch icon on each message |
| `features/conversation/components/conversation-view.tsx` | Orchestrates create/switch/delete + `useChat` |
| `features/conversation/hooks/use-branches.ts` | React Query for list + rename |
| `features/conversation/actions/conversation-actions.ts` | Creates **Main** when a new chat starts |

## Files changed / added (Phase 2)

### Added

| Path | Purpose |
| --- | --- |
| `features/conversation/actions/branch-actions.ts` | Create / switch / rename / delete / list |
| `features/conversation/components/branch-switcher.tsx` | Branch navigation UI |
| `features/conversation/hooks/use-branches.ts` | Client hooks for branches |
| `features/ai/utils/message-tree.ts` | `resolvePath` for branch histories |
| `prisma/migrations/20260719110000_chat_branching/` | Schema + backfill migration |

### Updated

| Path | Change |
| --- | --- |
| `prisma/schema.prisma` | `ConversationBranch`, `activeBranchId`, `Message.parentId` |
| `features/ai/actions/chat-store.ts` | Branch-aware load/save + ensure Main |
| `app/api/chat/route.ts` | Persist on active branch; load branch path |
| `features/conversation/actions/conversation-actions.ts` | Seed Main branch on new conversations |
| `features/conversation/components/conversation-view.tsx` | Branch state, handlers, switcher |
| `features/conversation/components/chat-messages.tsx` | “Branch from here” action |
| `features/conversation/components/app-sidebar.tsx` | Conversation list integration with branching era |
| `features/conversation/utils/query-keys.ts` | Branch query keys |

## Manual test plan

1. Start a chat with several user/assistant turns.
2. On a **middle** message, click **Branch from here** — toast “Branch created”; history truncates to that point.
3. Ask a different follow-up on the new branch.
4. Open the branch switcher → switch back to **Main** — original continuation should return.
5. **Rename** the side branch.
6. **Delete** the side branch — should return to Main; Main delete should be blocked.
7. Reload the page — active branch and histories should persist.

## Notes for evaluators

- History is **shared until the fork** (tree + heads), not cloned message rows.
- Each branch has an independent tip (`headMessageId`) and its own later messages.
- UX: header switcher for navigation; per-message control for creation; toasts and disabled states while a branch op or stream is in progress.
