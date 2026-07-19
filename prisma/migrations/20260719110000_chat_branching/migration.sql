-- Idempotent: partial apply may have already added columns/tables

ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "activeBranchId" TEXT;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "parentId" TEXT;

CREATE TABLE IF NOT EXISTS "ConversationBranch" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Main',
    "forkFromMessageId" TEXT,
    "headMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationBranch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Conversation_activeBranchId_key" ON "Conversation"("activeBranchId");
CREATE INDEX IF NOT EXISTS "ConversationBranch_conversationId_idx" ON "ConversationBranch"("conversationId");
CREATE INDEX IF NOT EXISTS "Message_parentId_idx" ON "Message"("parentId");

-- Backfill: chain parentId by createdAt within each conversation (only unset parents)
WITH ordered AS (
  SELECT
    id,
    "conversationId",
    LAG(id) OVER (PARTITION BY "conversationId" ORDER BY "createdAt" ASC, id ASC) AS prev_id
  FROM "Message"
)
UPDATE "Message" m
SET "parentId" = ordered.prev_id
FROM ordered
WHERE m.id = ordered.id
  AND m."parentId" IS NULL
  AND ordered.prev_id IS NOT NULL;

-- Backfill: create Main branch per conversation if missing
INSERT INTO "ConversationBranch" ("id", "conversationId", "name", "forkFromMessageId", "headMessageId", "createdAt", "updatedAt")
SELECT
  'br_' || c.id,
  c.id,
  'Main',
  (
    SELECT m.id
    FROM "Message" m
    WHERE m."conversationId" = c.id
    ORDER BY m."createdAt" ASC, m.id ASC
    LIMIT 1
  ),
  (
    SELECT m.id
    FROM "Message" m
    WHERE m."conversationId" = c.id
    ORDER BY m."createdAt" DESC, m.id DESC
    LIMIT 1
  ),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Conversation" c
WHERE NOT EXISTS (
  SELECT 1 FROM "ConversationBranch" b WHERE b."conversationId" = c.id
);

-- Point conversations at their Main branch when unset
UPDATE "Conversation" c
SET "activeBranchId" = (
  SELECT b.id
  FROM "ConversationBranch" b
  WHERE b."conversationId" = c.id
  ORDER BY b."createdAt" ASC
  LIMIT 1
)
WHERE c."activeBranchId" IS NULL;

-- Foreign keys (ignore if already present)
DO $$ BEGIN
  ALTER TABLE "ConversationBranch" ADD CONSTRAINT "ConversationBranch_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ConversationBranch" ADD CONSTRAINT "ConversationBranch_forkFromMessageId_fkey" FOREIGN KEY ("forkFromMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ConversationBranch" ADD CONSTRAINT "ConversationBranch_headMessageId_fkey" FOREIGN KEY ("headMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_activeBranchId_fkey" FOREIGN KEY ("activeBranchId") REFERENCES "ConversationBranch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Message" ADD CONSTRAINT "Message_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Message"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
