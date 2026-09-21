-- CreateEnum
CREATE TYPE "TelegramNotificationStatus" AS ENUM ('PENDING', 'PUBLISHING', 'PUBLISHED', 'FAILED');

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "assignedAgentId" TEXT,
ADD COLUMN     "claimedAt" TIMESTAMP(3),
ADD COLUMN     "telegramChatId" TEXT,
ADD COLUMN     "telegramMessageId" INTEGER,
ADD COLUMN     "telegramNotificationStatus" "TelegramNotificationStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "telegramPrivateDeliveryFailedAt" TIMESTAMP(3),
ADD COLUMN     "telegramPublishFailedAt" TIMESTAMP(3),
ADD COLUMN     "telegramPublishedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SalesAgent" (
    "id" TEXT NOT NULL,
    "telegramUserId" BIGINT NOT NULL,
    "telegramUsername" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramUpdate" (
    "updateId" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramUpdate_pkey" PRIMARY KEY ("updateId")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalesAgent_telegramUserId_key" ON "SalesAgent"("telegramUserId");

-- CreateIndex
CREATE INDEX "SalesAgent_isApproved_isActive_idx" ON "SalesAgent"("isApproved", "isActive");

-- CreateIndex
CREATE INDEX "Lead_assignedAgentId_claimedAt_idx" ON "Lead"("assignedAgentId", "claimedAt");

-- CreateIndex
CREATE INDEX "Lead_telegramNotificationStatus_idx" ON "Lead"("telegramNotificationStatus");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_assignedAgentId_fkey" FOREIGN KEY ("assignedAgentId") REFERENCES "SalesAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
