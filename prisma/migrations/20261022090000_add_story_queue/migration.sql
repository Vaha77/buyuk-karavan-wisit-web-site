-- Additive: Instagram stories queue (new enum and table only).
-- CreateEnum
CREATE TYPE "StoryQueueStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'PUBLISHING', 'PUBLISHED', 'REJECTED', 'FAILED', 'EXPIRED');

-- CreateTable
CREATE TABLE "StoryQueueItem" (
    "id" TEXT NOT NULL,
    "videoUrl" TEXT NOT NULL,
    "videoKey" VARCHAR(200),
    "caption" VARCHAR(1000),
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" "StoryQueueStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "sizeBytes" INTEGER,
    "durationMs" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "igContainerId" VARCHAR(64),
    "igMediaId" VARCHAR(64),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "error" VARCHAR(500),
    "approvedAt" TIMESTAMP(3),
    "approvedBy" VARCHAR(120),
    "publishedAt" TIMESTAMP(3),
    "telegramMessages" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoryQueueItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoryQueueItem_status_scheduledAt_idx" ON "StoryQueueItem"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "StoryQueueItem_scheduledAt_idx" ON "StoryQueueItem"("scheduledAt");
