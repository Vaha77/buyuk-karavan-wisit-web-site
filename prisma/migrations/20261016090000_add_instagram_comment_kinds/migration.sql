-- Additive: comment kinds, per-kind switches, daily limit, pacing, reply variants, AI cost. Only new enum values / columns / indexes.
-- CreateEnum
CREATE TYPE "InstagramCommentKind" AS ENUM ('PRICE', 'POSITIVE', 'QUESTION', 'NEGATIVE', 'SPAM', 'UNKNOWN');

-- AlterEnum
ALTER TYPE "InstagramReplyStatus" ADD VALUE 'NOTIFIED';

-- AlterTable
ALTER TABLE "InstagramAccount" ADD COLUMN     "dailyReplyLimit" INTEGER NOT NULL DEFAULT 150,
ADD COLUMN     "negativeNotify" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "nextActionAt" TIMESTAMP(3),
ADD COLUMN     "positiveEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "priceEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "questionDmTemplate" TEXT NOT NULL DEFAULT 'Assalomu alaykum! Savolingiz bo''yicha mutaxassisimiz yordam beradi: {telefon}',
ADD COLUMN     "questionEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "questionReplyText" TEXT NOT NULL DEFAULT 'Batafsil ma''lumotni Direct''ga yubordik 📩',
ADD COLUMN     "runnerUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "InstagramMediaRule" ADD COLUMN     "publicReplyVariants" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "InstagramComment" ADD COLUMN     "aiCostUsd" DECIMAL(12,6),
ADD COLUMN     "aiTokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "classifiedBy" VARCHAR(20),
ADD COLUMN     "dmText" TEXT,
ADD COLUMN     "kind" "InstagramCommentKind",
ADD COLUMN     "notifiedAt" TIMESTAMP(3),
ADD COLUMN     "parentId" VARCHAR(64),
ADD COLUMN     "publicReplyAt" TIMESTAMP(3),
ADD COLUMN     "publicReplyText" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedBy" TEXT;

-- CreateIndex
CREATE INDEX "InstagramComment_mediaId_fromId_idx" ON "InstagramComment"("mediaId", "fromId");

-- CreateIndex
CREATE INDEX "InstagramComment_publicReplyAt_idx" ON "InstagramComment"("publicReplyAt");

-- CreateIndex
CREATE INDEX "InstagramComment_kind_createdAt_idx" ON "InstagramComment"("kind", "createdAt");

