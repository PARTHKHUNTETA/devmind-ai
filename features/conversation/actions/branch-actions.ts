"use server";

import { resolvePath } from "@/features/ai/utils/message-tree";
import { loadChatMessages } from "@/features/ai/actions/chat-store";
import { requireUser } from "@/features/auth/action/require-user";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import type { UIMessage } from "ai";

/** Shape returned for branch switcher UI. */
export type BranchListItem = {
  id: string;
  name: string;
  conversationId: string;
  forkFromMessageId: string | null;
  headMessageId: string | null;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
};

async function assertOwnsConversation(conversationId: string, userId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
    select: {
      id: true,
      activeBranchId: true,
    },
  });

  if (!conversation) {
    throw new Error("Conversation not found");
  }

  return conversation;
}

async function assertOwnsBranch(branchId: string, userId: string) {
  const branch = await prisma.conversationBranch.findUnique({
    where: { id: branchId },
    include: {
      conversation: {
        select: { id: true, userId: true, activeBranchId: true },
      },
    },
  });

  if (!branch || branch.conversation.userId !== userId) {
    throw new Error("Branch not found");
  }

  return branch;
}

function toBranchListItem(
  branch: {
    id: string;
    name: string;
    conversationId: string;
    forkFromMessageId: string | null;
    headMessageId: string | null;
    createdAt: Date;
    updatedAt: Date;
  },
  activeBranchId: string | null
): BranchListItem {
  return {
    id: branch.id,
    name: branch.name,
    conversationId: branch.conversationId,
    forkFromMessageId: branch.forkFromMessageId,
    headMessageId: branch.headMessageId,
    createdAt: branch.createdAt,
    updatedAt: branch.updatedAt,
    isActive: branch.id === activeBranchId,
  };
}

/** Lists branches for a conversation (oldest first). */
export async function listBranches(
  conversationId: string
): Promise<BranchListItem[]> {
  const user = await requireUser();
  const conversation = await assertOwnsConversation(conversationId, user.id);

  const branches = await prisma.conversationBranch.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
  });

  return branches.map((branch) =>
    toBranchListItem(branch, conversation.activeBranchId)
  );
}

/**
 * Creates a named branch forked from message M and makes it active.
 * Visible history becomes the path ending at M (shared ancestors, no copy).
 */
export async function createBranchFromMessage(
  conversationId: string,
  messageId: string,
  name?: string
): Promise<{ branch: BranchListItem; messages: UIMessage[] }> {
  const user = await requireUser();
  await assertOwnsConversation(conversationId, user.id);

  const message = await prisma.message.findFirst({
    where: { id: messageId, conversationId },
  });

  if (!message) {
    throw new Error("Message not found");
  }

  const existingCount = await prisma.conversationBranch.count({
    where: { conversationId },
  });

  const branchName =
    name?.trim() ||
    (existingCount === 0 ? "Main" : `Branch ${existingCount + 1}`);

  const branch = await prisma.$transaction(async (tx) => {
    const created = await tx.conversationBranch.create({
      data: {
        conversationId,
        name: branchName,
        forkFromMessageId: messageId,
        headMessageId: messageId,
      },
    });

    await tx.conversation.update({
      where: { id: conversationId },
      data: { activeBranchId: created.id },
    });

    return created;
  });

  const messages = await loadChatMessages(conversationId, branch.id);

  revalidatePath(`/c/${conversationId}`);
  return {
    branch: toBranchListItem(branch, branch.id),
    messages,
  };
}

/** Switches the conversation's active branch. */
export async function switchBranch(
  conversationId: string,
  branchId: string
): Promise<{ branch: BranchListItem; messages: UIMessage[] }> {
  const user = await requireUser();
  await assertOwnsConversation(conversationId, user.id);

  const branch = await prisma.conversationBranch.findFirst({
    where: { id: branchId, conversationId },
  });

  if (!branch) {
    throw new Error("Branch not found");
  }

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { activeBranchId: branchId },
  });

  const messages = await loadChatMessages(conversationId, branchId);

  revalidatePath(`/c/${conversationId}`);
  return {
    branch: toBranchListItem(branch, branchId),
    messages,
  };
}

/** Renames a branch. */
export async function renameBranch(branchId: string, name: string) {
  const user = await requireUser();
  const existing = await assertOwnsBranch(branchId, user.id);

  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Branch name cannot be empty");
  }

  const branch = await prisma.conversationBranch.update({
    where: { id: branchId },
    data: { name: trimmed },
  });

  revalidatePath(`/c/${existing.conversationId}`);
  return toBranchListItem(branch, existing.conversation.activeBranchId);
}

/**
 * Deletes a branch. Falls back to Main (or oldest) if it was active.
 * Prunes messages that are not on any remaining branch path.
 */
export async function deleteBranch(branchId: string) {
  const user = await requireUser();
  const existing = await assertOwnsBranch(branchId, user.id);
  const conversationId = existing.conversationId;

  const allBranches = await prisma.conversationBranch.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
  });

  if (allBranches.length <= 1) {
    throw new Error("Cannot delete the only branch");
  }

  if (existing.name === "Main") {
    throw new Error("Cannot delete the Main branch");
  }

  const remaining = allBranches.filter((branch) => branch.id !== branchId);
  const fallback =
    remaining.find((branch) => branch.name === "Main") ?? remaining[0]!;

  const messages = await prisma.message.findMany({
    where: { conversationId },
    select: {
      id: true,
      parentId: true,
      role: true,
      content: true,
      parts: true,
    },
  });

  const byId = new Map(
    messages.map((row) => [
      row.id,
      {
        id: row.id,
        parentId: row.parentId,
        role: row.role,
        content: row.content,
        parts: row.parts,
      },
    ])
  );

  const keptIds = new Set<string>();
  for (const branch of remaining) {
    for (const row of resolvePath(byId, branch.headMessageId)) {
      keptIds.add(row.id);
    }
  }

  const orphanIds = messages
    .map((row) => row.id)
    .filter((id) => !keptIds.has(id));

  await prisma.$transaction(async (tx) => {
    if (existing.conversation.activeBranchId === branchId) {
      await tx.conversation.update({
        where: { id: conversationId },
        data: { activeBranchId: null },
      });
    }

    await tx.conversationBranch.delete({ where: { id: branchId } });

    if (orphanIds.length > 0) {
      const orphanSet = new Set(orphanIds);
      const childCount = new Map<string, number>();

      for (const row of messages) {
        if (!orphanSet.has(row.id)) continue;
        if (row.parentId && orphanSet.has(row.parentId)) {
          childCount.set(
            row.parentId,
            (childCount.get(row.parentId) ?? 0) + 1
          );
        }
      }

      const remainingOrphans = new Set(orphanIds);
      while (remainingOrphans.size > 0) {
        const leaves = [...remainingOrphans].filter(
          (id) => (childCount.get(id) ?? 0) === 0
        );

        if (leaves.length === 0) {
          await tx.message.updateMany({
            where: { id: { in: [...remainingOrphans] } },
            data: { parentId: null },
          });
          await tx.message.deleteMany({
            where: { id: { in: [...remainingOrphans] } },
          });
          break;
        }

        await tx.message.deleteMany({ where: { id: { in: leaves } } });

        for (const leafId of leaves) {
          remainingOrphans.delete(leafId);
          const parentId = byId.get(leafId)?.parentId;
          if (parentId && remainingOrphans.has(parentId)) {
            childCount.set(
              parentId,
              Math.max(0, (childCount.get(parentId) ?? 1) - 1)
            );
          }
        }
      }
    }

    await tx.conversation.update({
      where: { id: conversationId },
      data: { activeBranchId: fallback.id },
    });
  });

  revalidatePath(`/c/${conversationId}`);

  const pathMessages = await loadChatMessages(conversationId, fallback.id);

  return {
    id: branchId,
    conversationId,
    activeBranchId: fallback.id,
    messages: pathMessages,
  };
}
