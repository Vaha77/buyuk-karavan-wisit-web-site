-- Additive: Instagram xolodilnik bot (tonna komment → Direct suhbat, only the "global" account). New enum value, columns
-- with defaults on existing tables (the Direct chat reuses HeatPumpThread), one new table and the first kit
-- (100 t → 20 HP; link the Prays product / enter the price in the admin). Backup first (npm run backup:crm).

-- AlterEnum
ALTER TYPE "InstagramCommentKind" ADD VALUE 'COOLER';

-- AlterTable
ALTER TABLE "InstagramMediaRule" ADD COLUMN "cooler" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SiteSettings" ADD COLUMN "coolerTexts" JSONB;
ALTER TABLE "HeatPumpThread" ADD COLUMN "flow" VARCHAR(10) NOT NULL DEFAULT 'heat',
  ADD COLUMN "tons" INTEGER, ADD COLUMN "chambers" INTEGER, ADD COLUMN "region" TEXT,
  ADD COLUMN "step" VARCHAR(10), ADD COLUMN "misses" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CoolerKit" (
    "id" TEXT NOT NULL,
    "minTons" INTEGER NOT NULL,
    "maxTons" INTEGER NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "items" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "productId" TEXT,
    "priceUsd" DECIMAL(10,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CoolerKit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CoolerKit_productId_idx" ON "CoolerKit"("productId");

-- AddForeignKey
ALTER TABLE "CoolerKit" ADD CONSTRAINT "CoolerKit_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed: 100 t chamber → 20 HP kit, no product / price yet.
INSERT INTO "CoolerKit" ("id", "minTons", "maxTons", "name", "items", "updatedAt") VALUES
  ('kit_20hp', 100, 100, '20 HP komplekt', ARRAY['Kompressor 20 HP', 'Kondensator FN-160', 'Isparitel DD-160', 'TRV', 'Freon', 'Avtomatika shiti', 'Mis trubalar va boshqalar'], CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
