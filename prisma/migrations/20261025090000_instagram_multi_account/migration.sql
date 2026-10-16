-- Instagram multi-account (@buyuk_karavan, @eshikmaster…). Additive: new columns with defaults, no data removed.
-- Every existing row gets accountId = 'global' (the id of the account connected before), so Buyuk Karavan keeps working
-- as is. Two keys become per-account: the daily stat / audience snapshot primary keys (date → accountId + date) and the
-- Direct customer (igsid → accountId + igsid).
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InstagramCommentKind" ADD VALUE 'PHONE';
ALTER TYPE "InstagramCommentKind" ADD VALUE 'ADDRESS';
ALTER TYPE "InstagramCommentKind" ADD VALUE 'HOURS';

-- DropIndex
DROP INDEX "InstagramConversation_igsid_key";

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "instagramAccountId" VARCHAR(64);

-- AlterTable
ALTER TABLE "InstagramAccount" ADD COLUMN     "address" TEXT,
ADD COLUMN     "addressDmTemplate" TEXT NOT NULL DEFAULT 'Assalomu alaykum! Manzil: {manzil}. Mo''ljal: {moljal}. Xarita: {xarita}',
ADD COLUMN     "brandName" TEXT,
ADD COLUMN     "contactRepliesEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "directChatId" VARCHAR(32),
ADD COLUMN     "hoursDmTemplate" TEXT NOT NULL DEFAULT 'Assalomu alaykum! Ish vaqtimiz: {ishVaqti}. Telefon: {telefon}',
ADD COLUMN     "label" TEXT,
ADD COLUMN     "landmark" TEXT,
ADD COLUMN     "mapLink" TEXT,
ADD COLUMN     "negativeChatId" VARCHAR(32),
ADD COLUMN     "noPriceDmTemplate" TEXT,
ADD COLUMN     "phoneDmTemplate" TEXT NOT NULL DEFAULT 'Assalomu alaykum! Telefon: {telefon}',
ADD COLUMN     "workHours" TEXT,
ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "InstagramMediaRule" ADD COLUMN     "accountId" VARCHAR(64) NOT NULL DEFAULT 'global',
ADD COLUMN     "priceText" TEXT;

-- AlterTable
ALTER TABLE "InstagramComment" ADD COLUMN     "accountId" VARCHAR(64) NOT NULL DEFAULT 'global';

-- AlterTable
ALTER TABLE "InstagramMessage" ADD COLUMN     "accountId" VARCHAR(64) NOT NULL DEFAULT 'global';

-- AlterTable
ALTER TABLE "InstagramConversation" ADD COLUMN     "accountId" VARCHAR(64) NOT NULL DEFAULT 'global';

-- AlterTable
ALTER TABLE "InstagramDailyStat" DROP CONSTRAINT "InstagramDailyStat_pkey",
ADD COLUMN     "accountId" VARCHAR(64) NOT NULL DEFAULT 'global',
ADD CONSTRAINT "InstagramDailyStat_pkey" PRIMARY KEY ("accountId", "date");

-- AlterTable
ALTER TABLE "InstagramMediaStat" ADD COLUMN     "accountId" VARCHAR(64) NOT NULL DEFAULT 'global';

-- AlterTable
ALTER TABLE "InstagramAudienceSnapshot" DROP CONSTRAINT "InstagramAudienceSnapshot_pkey",
ADD COLUMN     "accountId" VARCHAR(64) NOT NULL DEFAULT 'global',
ADD CONSTRAINT "InstagramAudienceSnapshot_pkey" PRIMARY KEY ("accountId", "date");

-- AlterTable
ALTER TABLE "StoryQueueItem" ADD COLUMN     "accountId" VARCHAR(64) NOT NULL DEFAULT 'global';

-- AlterTable
ALTER TABLE "TtsGeneration" ADD COLUMN     "accountId" VARCHAR(64) NOT NULL DEFAULT 'global';

-- CreateIndex
CREATE UNIQUE INDEX "InstagramAccount_igUserId_key" ON "InstagramAccount"("igUserId");

-- CreateIndex
CREATE INDEX "InstagramMediaRule_accountId_idx" ON "InstagramMediaRule"("accountId");

-- CreateIndex
CREATE INDEX "InstagramComment_accountId_status_nextAttemptAt_idx" ON "InstagramComment"("accountId", "status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "InstagramMessage_accountId_direction_sentAt_idx" ON "InstagramMessage"("accountId", "direction", "sentAt");

-- CreateIndex
CREATE INDEX "InstagramConversation_igsid_idx" ON "InstagramConversation"("igsid");

-- CreateIndex
CREATE UNIQUE INDEX "InstagramConversation_accountId_igsid_key" ON "InstagramConversation"("accountId", "igsid");

-- CreateIndex
CREATE INDEX "InstagramMediaStat_accountId_postedAt_idx" ON "InstagramMediaStat"("accountId", "postedAt");


-- Backfill: the AI keeps writing as Buyuk Karavan; existing Instagram leads belong to the first account.
UPDATE "InstagramAccount" SET "brandName" = 'BUYUK KARAVAN (sanoat sovutish uskunalari, Namangan)' WHERE "id" = 'global' AND "brandName" IS NULL;
UPDATE "Lead" SET "instagramAccountId" = 'global' WHERE "source" IN ('INSTAGRAM', 'INSTAGRAM_DM') AND "instagramAccountId" IS NULL;
