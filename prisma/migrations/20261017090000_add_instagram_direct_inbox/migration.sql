-- Additive: Instagram Direct → Telegram (conversations, message direction / kind, recipients, work hours). New enums / enum value / table / columns / indexes only.
-- CreateEnum
CREATE TYPE "InstagramMessageDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "InstagramConversationStatus" AS ENUM ('UNREAD', 'OPENED', 'ANSWERED', 'DISMISSED');

-- AlterEnum
ALTER TYPE "LeadSource" ADD VALUE 'INSTAGRAM_DM';

-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN     "receivesInstagramDirect" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "InstagramAccount" ADD COLUMN     "directAutoAckEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "directAutoAckText" TEXT NOT NULL DEFAULT 'Assalomu alaykum! Xabaringiz qabul qilindi, mutaxassisimiz tez orada javob beradi.',
ADD COLUMN     "directDigestDate" VARCHAR(10),
ADD COLUMN     "directReportDate" VARCHAR(10),
ADD COLUMN     "directTickAt" TIMESTAMP(3),
ADD COLUMN     "directWorkEnd" INTEGER NOT NULL DEFAULT 1200,
ADD COLUMN     "directWorkStart" INTEGER NOT NULL DEFAULT 540;

-- AlterTable
ALTER TABLE "InstagramMessage" ADD COLUMN     "conversationId" TEXT,
ADD COLUMN     "direction" "InstagramMessageDirection" NOT NULL DEFAULT 'IN',
ADD COLUMN     "isAuto" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "kind" VARCHAR(20) NOT NULL DEFAULT 'TEXT',
ADD COLUMN     "responseMs" INTEGER,
ADD COLUMN     "toId" VARCHAR(64);

-- CreateTable
CREATE TABLE "InstagramConversation" (
    "id" TEXT NOT NULL,
    "igsid" VARCHAR(64) NOT NULL,
    "username" TEXT,
    "name" TEXT,
    "profileFetchedAt" TIMESTAMP(3),
    "status" "InstagramConversationStatus" NOT NULL DEFAULT 'UNREAD',
    "firstMessageAt" TIMESTAMP(3) NOT NULL,
    "lastIncomingAt" TIMESTAMP(3),
    "lastOutgoingAt" TIMESTAMP(3),
    "waitingSince" TIMESTAMP(3),
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "cycleCount" INTEGER NOT NULL DEFAULT 0,
    "openedAt" TIMESTAMP(3),
    "openedById" TEXT,
    "openedByName" TEXT,
    "answeredAt" TIMESTAMP(3),
    "answeredVia" VARCHAR(20),
    "lastResponseMs" INTEGER,
    "dismissedAt" TIMESTAMP(3),
    "dismissReason" TEXT,
    "dismissedBy" TEXT,
    "deferred" BOOLEAN NOT NULL DEFAULT false,
    "reminded30At" TIMESTAMP(3),
    "reminded2hAt" TIMESTAMP(3),
    "telegramCards" JSONB NOT NULL DEFAULT '[]',
    "cardLockUntil" TIMESTAMP(3),
    "autoAckAt" TIMESTAMP(3),
    "leadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstagramConversation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InstagramConversation_igsid_key" ON "InstagramConversation"("igsid");

-- CreateIndex
CREATE INDEX "InstagramConversation_status_waitingSince_idx" ON "InstagramConversation"("status", "waitingSince");

-- CreateIndex
CREATE INDEX "InstagramConversation_lastIncomingAt_idx" ON "InstagramConversation"("lastIncomingAt");

-- CreateIndex
CREATE INDEX "InstagramMessage_conversationId_sentAt_idx" ON "InstagramMessage"("conversationId", "sentAt");

-- CreateIndex
CREATE INDEX "InstagramMessage_direction_sentAt_idx" ON "InstagramMessage"("direction", "sentAt");

-- AddForeignKey
ALTER TABLE "InstagramMessage" ADD CONSTRAINT "InstagramMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "InstagramConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

