-- Additive: per-account AI reply to every comment (own prompt) and switches for leads / Direct → Telegram.
-- AlterTable
ALTER TABLE "InstagramAccount" ADD COLUMN     "aiPrompt" TEXT,
ADD COLUMN     "aiReplyAll" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "directEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "leadsEnabled" BOOLEAN NOT NULL DEFAULT true;

