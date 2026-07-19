import type { Prisma } from "@/lib/generated/prisma/client";

export type MessageTreeRow = {
  id: string;
  parentId: string | null;
  role: "USER" | "ASSISTANT" | "SYSTEM" | "TOOL";
  content: string;
  parts: Prisma.JsonValue | null;
};

/** Walks parentId links from a leaf to the root, returning oldest → newest. */
export function resolvePath(
  messagesById: Map<string, MessageTreeRow>,
  leafId: string | null | undefined
): MessageTreeRow[] {
  if (!leafId) return [];

  const path: MessageTreeRow[] = [];
  const seen = new Set<string>();
  let currentId: string | null | undefined = leafId;

  while (currentId) {
    if (seen.has(currentId)) break;
    seen.add(currentId);

    const row = messagesById.get(currentId);
    if (!row) break;

    path.push(row);
    currentId = row.parentId;
  }

  return path.reverse();
}
