-- CreateEnum
CREATE TYPE "LeadActivityType" AS ENUM ('LEAD_CREATED', 'CLAIMED', 'CONTACTED', 'COMMENT_ADDED', 'FOLLOW_UP_SCHEDULED', 'FOLLOW_UP_COMPLETED', 'FOLLOW_UP_POSTPONED', 'STATUS_CHANGED', 'SALE_REPORTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "LeadFollowUpStatus" AS ENUM ('SCHEDULED', 'REMINDER_RESERVED', 'REMINDER_SENT', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LeadOutcome" AS ENUM ('THINKING', 'LATER', 'OFFER_SENT', 'NEGOTIATING', 'NO_ANSWER', 'SALE', 'REJECTED', 'INVALID');

-- CreateEnum
CREATE TYPE "TelegramConversationStep" AS ENUM ('AWAITING_COMMENT', 'AWAITING_FOLLOW_UP', 'AWAITING_CUSTOM_DATE', 'AWAITING_POSTPONE', 'AWAITING_POSTPONE_DATE');

-- CreateTable
CREATE TABLE "LeadActivity" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "agentId" TEXT,
    "type" "LeadActivityType" NOT NULL,
    "comment" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadFollowUp" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" "LeadFollowUpStatus" NOT NULL DEFAULT 'SCHEDULED',
    "reminderSentAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadFollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramConversationState" (
    "agentId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "step" "TelegramConversationStep" NOT NULL,
    "outcome" "LeadOutcome",
    "followUpId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramConversationState_pkey" PRIMARY KEY ("agentId")
);

-- CreateIndex
CREATE INDEX "LeadActivity_leadId_createdAt_idx" ON "LeadActivity"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "LeadActivity_agentId_createdAt_idx" ON "LeadActivity"("agentId", "createdAt");

-- CreateIndex
CREATE INDEX "LeadFollowUp_status_scheduledFor_idx" ON "LeadFollowUp"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "LeadFollowUp_leadId_status_idx" ON "LeadFollowUp"("leadId", "status");

-- CreateIndex
CREATE INDEX "LeadFollowUp_agentId_scheduledFor_idx" ON "LeadFollowUp"("agentId", "scheduledFor");

-- CreateIndex
CREATE INDEX "TelegramConversationState_leadId_idx" ON "TelegramConversationState"("leadId");

-- AddForeignKey
ALTER TABLE "LeadActivity" ADD CONSTRAINT "LeadActivity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadActivity" ADD CONSTRAINT "LeadActivity_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "SalesAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadFollowUp" ADD CONSTRAINT "LeadFollowUp_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadFollowUp" ADD CONSTRAINT "LeadFollowUp_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "SalesAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramConversationState" ADD CONSTRAINT "TelegramConversationState_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "SalesAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramConversationState" ADD CONSTRAINT "TelegramConversationState_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramConversationState" ADD CONSTRAINT "TelegramConversationState_followUpId_fkey" FOREIGN KEY ("followUpId") REFERENCES "LeadFollowUp"("id") ON DELETE SET NULL ON UPDATE CASCADE;
