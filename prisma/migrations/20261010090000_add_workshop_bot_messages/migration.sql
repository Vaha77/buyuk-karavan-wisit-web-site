-- Seh bot: per-user order messages, one-time Telegram link codes, delivery failure flag. Additive only.
-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN     "telegramLinkCode" VARCHAR(40),
ADD COLUMN     "telegramLinkExpiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "WorkshopOrder" ADD COLUMN     "telegramError" VARCHAR(200),
ADD COLUMN     "telegramFailedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "WorkshopOrderMessage" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "chatId" VARCHAR(32) NOT NULL,
    "messageId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkshopOrderMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkshopOrderMessage_orderId_chatId_key" ON "WorkshopOrderMessage"("orderId", "chatId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_telegramLinkCode_key" ON "AdminUser"("telegramLinkCode");

-- AddForeignKey
ALTER TABLE "WorkshopOrderMessage" ADD CONSTRAINT "WorkshopOrderMessage_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "WorkshopOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

