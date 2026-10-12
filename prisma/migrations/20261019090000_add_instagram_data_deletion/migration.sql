-- Additive: Meta data deletion requests (status page /data-deletion?code=…). New table only.
-- CreateTable
CREATE TABLE "InstagramDataDeletion" (
    "code" VARCHAR(32) NOT NULL,
    "userHash" VARCHAR(64) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "comments" INTEGER NOT NULL DEFAULT 0,
    "messages" INTEGER NOT NULL DEFAULT 0,
    "conversations" INTEGER NOT NULL DEFAULT 0,
    "leads" INTEGER NOT NULL DEFAULT 0,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "InstagramDataDeletion_pkey" PRIMARY KEY ("code")
);

-- CreateIndex
CREATE INDEX "InstagramDataDeletion_userHash_idx" ON "InstagramDataDeletion"("userHash");
