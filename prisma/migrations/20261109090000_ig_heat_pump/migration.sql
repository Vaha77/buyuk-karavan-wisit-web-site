-- Additive: Instagram teplonasos bot (only the "global" account). New enum value, columns with defaults, two new tables
-- and the starting Teplonasos jadvali rows. Backup first (npm run backup:crm).

-- AlterEnum
ALTER TYPE "InstagramCommentKind" ADD VALUE 'HEAT_PUMP';

-- AlterTable
ALTER TABLE "InstagramMediaRule" ADD COLUMN "heatPump" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "InstagramComment" ADD COLUMN "heatPumpM2" INTEGER, ADD COLUMN "heatPumpIntent" VARCHAR(10);
ALTER TABLE "SiteSettings" ADD COLUMN "heatPumpBufferUsd" DECIMAL(10,2) NOT NULL DEFAULT 145, ADD COLUMN "heatPumpBufferLiters" INTEGER NOT NULL DEFAULT 60;

-- CreateTable
CREATE TABLE "HeatPumpModel" (
    "id" TEXT NOT NULL,
    "brand" VARCHAR(40) NOT NULL,
    "model" VARCHAR(60) NOT NULL,
    "hp" DECIMAL(6,1) NOT NULL,
    "nominalKw" DECIMAL(6,1) NOT NULL,
    "winterKw" DECIMAL(6,1) NOT NULL,
    "voltage" INTEGER NOT NULL DEFAULT 220,
    "priceUsd" DECIMAL(10,2) NOT NULL,
    "bufferIncluded" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HeatPumpModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HeatPumpThread" (
    "id" TEXT NOT NULL,
    "accountId" VARCHAR(64) NOT NULL,
    "igsid" VARCHAR(64) NOT NULL,
    "mediaId" VARCHAR(64) NOT NULL,
    "username" TEXT,
    "m2" INTEGER,
    "model" TEXT,
    "phone" TEXT,
    "leadId" TEXT,
    "botReplies" INTEGER NOT NULL DEFAULT 0,
    "mutedUntil" TIMESTAMP(3),
    "lastBotText" TEXT,
    "lastBotMid" VARCHAR(255),
    "lastBotAt" TIMESTAMP(3),
    "lastInMid" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HeatPumpThread_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HeatPumpThread_accountId_igsid_key" ON "HeatPumpThread"("accountId", "igsid");
CREATE INDEX "HeatPumpThread_mediaId_idx" ON "HeatPumpThread"("mediaId");

-- Seed: selling prices (no markup). 6 HP from the nameplate; 3, 8 and 12 HP approximate, corrected in the admin.
INSERT INTO "HeatPumpModel" ("id", "brand", "model", "hp", "nominalKw", "winterKw", "voltage", "priceUsd", "bufferIncluded", "updatedAt") VALUES
  ('hp_aire_3', 'Aire', '3 HP', 3, 10, 6.6, 220, 1300, false, CURRENT_TIMESTAMP),
  ('hp_aire_6', 'Aire', '6 HP', 6, 19, 12.5, 220, 2650, true, CURRENT_TIMESTAMP),
  ('hp_aire_8', 'Aire', '8 HP', 8, 24, 15.8, 220, 3250, true, CURRENT_TIMESTAMP),
  ('hp_aire_12', 'Aire', '12 HP', 12, 36, 23.7, 380, 4100, true, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
