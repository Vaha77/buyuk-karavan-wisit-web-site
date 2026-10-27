-- Additive: BK Kassa Telegram bot drafts + update ids (new tables only). Backup first (npm run backup:crm).

-- CreateEnum
CREATE TYPE "KassaDraftSource" AS ENUM ('VOICE', 'TEXT');

-- CreateEnum
CREATE TYPE "KassaDraftStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED');

-- CreateTable
CREATE TABLE "KassaDraft" (
    "id" TEXT NOT NULL,
    "source" "KassaDraftSource" NOT NULL,
    "rawText" TEXT NOT NULL,
    "transcript" TEXT,
    "type" "KassaType",
    "amount" DECIMAL(18,2),
    "currency" "MoneyCurrency",
    "categoryId" TEXT,
    "paymentType" "KassaPayment" NOT NULL DEFAULT 'CASH',
    "note" VARCHAR(300) NOT NULL,
    "flags" TEXT[],
    "status" "KassaDraftStatus" NOT NULL DEFAULT 'PENDING',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "tgChatId" VARCHAR(32) NOT NULL,
    "tgReplyMessageId" INTEGER,
    "editRequestedAt" TIMESTAMP(3),
    "entryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KassaDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KassaBotUpdate" (
    "updateId" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KassaBotUpdate_pkey" PRIMARY KEY ("updateId")
);

-- CreateIndex
CREATE UNIQUE INDEX "KassaDraft_entryId_key" ON "KassaDraft"("entryId");

-- CreateIndex
CREATE INDEX "KassaDraft_status_createdAt_idx" ON "KassaDraft"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "KassaDraft" ADD CONSTRAINT "KassaDraft_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "KassaCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KassaDraft" ADD CONSTRAINT "KassaDraft_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "KassaEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

