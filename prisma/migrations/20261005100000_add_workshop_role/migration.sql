-- Sex mas'uli role and the Telegram id that lets them press workshop buttons. Additive only.
-- AlterEnum
ALTER TYPE "AdminRole" ADD VALUE 'WORKSHOP';

-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN     "telegramChatId" VARCHAR(32);

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_telegramChatId_key" ON "AdminUser"("telegramChatId");

