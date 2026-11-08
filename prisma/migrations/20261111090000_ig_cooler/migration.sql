-- Additive: Instagram xolodilnik bot (tonna komment → Direct suhbat). New enum value, columns with defaults, two new
-- tables and the first kit (100 t → 20 HP, price entered later in the admin). Backup first (npm run backup:crm).

-- AlterEnum
ALTER TYPE "InstagramCommentKind" ADD VALUE 'COOLER';

-- AlterTable
ALTER TABLE "InstagramMediaRule" ADD COLUMN "cooler" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SiteSettings" ADD COLUMN "coolerTexts" JSONB;

-- CreateTable
CREATE TABLE "CoolerKit" (
    "id" TEXT NOT NULL,
    "minTons" INTEGER NOT NULL,
    "maxTons" INTEGER NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "items" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "priceUsd" DECIMAL(10,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CoolerKit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoolerThread" (
    "id" TEXT NOT NULL,
    "accountId" VARCHAR(64) NOT NULL,
    "igsid" VARCHAR(64) NOT NULL,
    "commentId" VARCHAR(64) NOT NULL,
    "mediaId" VARCHAR(64) NOT NULL,
    "username" TEXT,
    "step" VARCHAR(10) NOT NULL DEFAULT 'chambers',
    "tons" INTEGER NOT NULL,
    "chambers" INTEGER,
    "kit" TEXT,
    "region" TEXT,
    "phone" TEXT,
    "misses" INTEGER NOT NULL DEFAULT 0,
    "leadId" TEXT,
    "lastBotText" TEXT,
    "lastBotMid" VARCHAR(255),
    "lastBotAt" TIMESTAMP(3),
    "lastInMid" VARCHAR(255),
    "mutedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CoolerThread_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CoolerThread_commentId_key" ON "CoolerThread"("commentId");
CREATE UNIQUE INDEX "CoolerThread_accountId_igsid_key" ON "CoolerThread"("accountId", "igsid");
CREATE INDEX "CoolerThread_mediaId_idx" ON "CoolerThread"("mediaId");

-- Seed: 100 t chamber → 20 HP kit, no price yet.
INSERT INTO "CoolerKit" ("id", "minTons", "maxTons", "name", "items", "updatedAt") VALUES
  ('kit_20hp', 100, 100, '20 HP komplekt', ARRAY['Kompressor 20 HP', 'Kondensator FN-160', 'Isparitel DD-160', 'TRV', 'Freon', 'Avtomatika shiti', 'Mis trubalar va boshqalar'], CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
