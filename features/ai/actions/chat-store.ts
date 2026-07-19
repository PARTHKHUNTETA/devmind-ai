"use server";

import { isTextUIPart, type UIMessage } from "ai";
import type { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  resolvePath,
  type MessageTreeRow,
} from "@/features/ai/utils/message-tree";

/** Extracts plain text from an AI SDK `UIMessage` by joining all text parts. */
function getMessageText(message: UIMessage) {
  return message.parts.filter(isTextUIPart).map((part) => part.text).join("");
}

/**
 * Normalizes stored message parts from the database into AI SDK `UIMessage` parts.
 * Falls back to a single text part when no structured parts are stored.
 */
function toUIMessageParts(
  parts: Prisma.JsonValue | null,
  content: string
): UIMessage["parts"] {
  const stored = parts as UIMessage["parts"] | null;
  if (Array.isArray(stored) && stored.length > 0) {
    return stored;
  }

  return [{ type: "text", text: content }];
}

function toUIMessages(rows: MessageTreeRow[]): UIMessage[] {
  return rows
    .filter((row) => row.role === "USER" || row.role === "ASSISTANT")
    .map((row) => ({
      id: row.id,
      role: row.role === "ASSISTANT" ? ("assistant" as const) : ("user" as const),
      parts: toUIMessageParts(row.parts, row.content),
    }));
}

/**
 * Ensures a conversation has a Main branch and activeBranchId.
 * Used as a safety net for rows that predate branching.
 */
export async function ensureMainBranch(conversationId: string) {
  const conversation = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    select: {
      id: true,
      activeBranchId: true,
      branches: {
        orderBy: { createdAt: "asc" },
        take: 1,
      },
    },
  });

  if (conversation.activeBranchId) {
    const active = await prisma.conversationBranch.findUnique({
      where: { id: conversation.activeBranchId },
    });
    if (active) return active;
  }

  if (conversation.branches[0]) {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { activeBranchId: conversation.branches[0].id },
    });
    return conversation.branches[0];
  }

  const lastMessage = await prisma.message.findFirst({
    where: { conversationId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true },
  });

  const firstMessage = await prisma.message.findFirst({
    where: { conversationId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });

  return prisma.$transaction(async (tx) => {
    const main = await tx.conversationBranch.create({
      data: {
        conversationId,
        name: "Main",
        forkFromMessageId: firstMessage?.id ?? null,
        headMessageId: lastMessage?.id ?? null,
      },
    });

    await tx.conversation.update({
      where: { id: conversationId },
      data: { activeBranchId: main.id },
    });

    return main;
  });
}

/** Returns the active branch for a conversation, creating Main if needed. */
export async function getActiveBranch(conversationId: string) {
  return ensureMainBranch(conversationId);
}

/**
 * Loads messages on the active branch path (or a specific branch) as UIMessages.
 */
export async function loadChatMessages(
  conversationId: string,
  branchId?: string
): Promise<UIMessage[]> {
  const branch = branchId
    ? await prisma.conversationBranch.findFirst({
        where: { id: branchId, conversationId },
      })
    : await getActiveBranch(conversationId);

  if (!branch) {
    return [];
  }

  const rows = await prisma.message.findMany({
    where: { conversationId },
    select: {
      id: true,
      parentId: true,
      role: true,
      content: true,
      parts: true,
    },
  });

  const byId = new Map(rows.map((row) => [row.id, row]));
  return toUIMessages(resolvePath(byId, branch.headMessageId));
}

type SaveChatMessagesOptions = {
  updateTitle?: boolean;
  /** Parent of the first new message being saved on this call. */
  parentId?: string | null;
  branchId?: string;
};

/**
 * Upserts AI SDK `UIMessage`s into the database for a conversation path.
 *
 * Chains `parentId` across the batch (first message uses `options.parentId`
 * or the current branch head) and advances the branch head.
 */
export async function saveChatMessages(
  conversationId: string,
  messages: UIMessage[],
  options: SaveChatMessagesOptions = {}
) {
  const { updateTitle = true, branchId } = options;

  const branch = branchId
    ? await prisma.conversationBranch.findFirstOrThrow({
        where: { id: branchId, conversationId },
      })
    : await getActiveBranch(conversationId);

  let previousId: string | null =
    options.parentId !== undefined
      ? options.parentId
      : (branch.headMessageId ?? null);

  let lastSavedId: string | null = null;

  for (const message of messages) {
    if (message.role === "system") continue;

    const content = getMessageText(message);
    const role = message.role === "assistant" ? "ASSISTANT" : "USER";

    const existing = await prisma.message.findUnique({
      where: { id: message.id },
      select: { id: true, parentId: true },
    });

    const parentId = existing?.parentId ?? previousId;

    await prisma.message.upsert({
      where: { id: message.id },
      create: {
        id: message.id,
        conversationId,
        parentId,
        role,
        status: "COMPLETE",
        content,
        parts: message.parts as Prisma.InputJsonValue,
      },
      update: {
        content,
        parts: message.parts as Prisma.InputJsonValue,
        status: "COMPLETE",
      },
    });

    previousId = message.id;
    lastSavedId = message.id;
  }

  if (lastSavedId) {
    // First message on an empty branch becomes the fork point.
    const firstSaved = messages.find((message) => message.role !== "system");
    await prisma.conversationBranch.update({
      where: { id: branch.id },
      data: {
        headMessageId: lastSavedId,
        ...(branch.forkFromMessageId || !firstSaved
          ? {}
          : { forkFromMessageId: firstSaved.id }),
      },
    });
  }

  const conversation = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    select: { title: true },
  });

  const firstUser = messages.find((message) => message.role === "user");
  const firstUserText = firstUser ? getMessageText(firstUser).trim() : "";

  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      lastMessageAt: new Date(),
      title:
        updateTitle && conversation.title === "New Chat" && firstUserText
          ? firstUserText.slice(0, 48)
          : conversation.title,
    },
  });
}
