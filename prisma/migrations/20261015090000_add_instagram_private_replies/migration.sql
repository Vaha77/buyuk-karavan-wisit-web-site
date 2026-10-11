-- Additive: Instagram comment → Direct price. New enum value, new enum, four new tables; nothing existing is changed or dropped.
-- CreateEnum
CREATE TYPE "InstagramReplyStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- AlterEnum
ALTER TYPE "LeadSource" ADD VALUE 'INSTAGRAM';

-- CreateTable
CREATE TABLE "InstagramAccount" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "igUserId" VARCHAR(64) NOT NULL,
    "username" TEXT NOT NULL,
    "tokenEncrypted" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "tokenRefreshedAt" TIMESTAMP(3) NOT NULL,
    "webhookSubscribedAt" TIMESTAMP(3),
    "webhookError" TEXT,
    "lastWebhookAt" TIMESTAMP(3),
    "connectedById" TEXT,
    "generalReplyEnabled" BOOLEAN NOT NULL DEFAULT false,
    "generalReplyText" TEXT NOT NULL DEFAULT 'Direct''ga yozing, mutaxassis javob beradi',
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstagramAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstagramMediaRule" (
    "mediaId" VARCHAR(64) NOT NULL,
    "productId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dmTemplate" TEXT NOT NULL,
    "publicReplyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "publicReplyText" TEXT NOT NULL DEFAULT 'Narxini Direct''ga yubordik ✅',
    "permalink" TEXT,
    "caption" TEXT,
    "postedAt" TIMESTAMP(3),
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstagramMediaRule_pkey" PRIMARY KEY ("mediaId")
);

-- CreateTable
CREATE TABLE "InstagramComment" (
    "commentId" VARCHAR(64) NOT NULL,
    "mediaId" VARCHAR(64) NOT NULL,
    "fromId" VARCHAR(64) NOT NULL,
    "username" TEXT,
    "text" TEXT NOT NULL,
    "status" "InstagramReplyStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "productId" TEXT,
    "productName" TEXT,
    "dmMessageId" TEXT,
    "dmSentAt" TIMESTAMP(3),
    "publicReplyId" TEXT,
    "publicReplyError" TEXT,
    "leadId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstagramComment_pkey" PRIMARY KEY ("commentId")
);

-- CreateTable
CREATE TABLE "InstagramMessage" (
    "mid" VARCHAR(255) NOT NULL,
    "fromId" VARCHAR(64) NOT NULL,
    "text" TEXT,
    "hasAttachments" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstagramMessage_pkey" PRIMARY KEY ("mid")
);

-- CreateIndex
CREATE INDEX "InstagramMediaRule_productId_idx" ON "InstagramMediaRule"("productId");

-- CreateIndex
CREATE INDEX "InstagramComment_status_nextAttemptAt_idx" ON "InstagramComment"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "InstagramComment_mediaId_createdAt_idx" ON "InstagramComment"("mediaId", "createdAt");

-- CreateIndex
CREATE INDEX "InstagramComment_createdAt_idx" ON "InstagramComment"("createdAt");

-- CreateIndex
CREATE INDEX "InstagramMessage_createdAt_idx" ON "InstagramMessage"("createdAt");

-- CreateIndex
CREATE INDEX "InstagramMessage_fromId_idx" ON "InstagramMessage"("fromId");

-- AddForeignKey
ALTER TABLE "InstagramMediaRule" ADD CONSTRAINT "InstagramMediaRule_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

