-- Prays: price-list (base) prices, selling markup, workshop parts and price history. Additive only.
-- CreateEnum
CREATE TYPE "PriceChangeSource" AS ENUM ('MANUAL', 'EXCEL', 'AI_IMAGE', 'PERCENT');

-- CreateEnum
CREATE TYPE "PriceEntityType" AS ENUM ('PRODUCT', 'SEX_PART');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "basePriceUsd" DECIMAL(18,2),
ADD COLUMN     "priceListDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SiteSettings" ADD COLUMN     "priceMarkupPercent" INTEGER NOT NULL DEFAULT 10;

-- CreateTable
CREATE TABLE "SexPart" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "size" TEXT,
    "group" TEXT NOT NULL,
    "basePriceUsd" DECIMAL(18,2),
    "unit" TEXT NOT NULL DEFAULT 'dona',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "priceListDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SexPart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceChange" (
    "id" TEXT NOT NULL,
    "entityType" "PriceEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityName" TEXT NOT NULL,
    "oldBase" DECIMAL(18,2),
    "newBase" DECIMAL(18,2),
    "source" "PriceChangeSource" NOT NULL,
    "priceListName" TEXT,
    "batchId" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SexPart_active_group_idx" ON "SexPart"("active", "group");

-- CreateIndex
CREATE INDEX "PriceChange_createdAt_idx" ON "PriceChange"("createdAt");

-- CreateIndex
CREATE INDEX "PriceChange_entityType_entityId_idx" ON "PriceChange"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "PriceChange_batchId_idx" ON "PriceChange"("batchId");

-- AddForeignKey
ALTER TABLE "PriceChange" ADD CONSTRAINT "PriceChange_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill: current selling prices were set as ceil(base × 1.10). basePriceUsd = the smallest whole x with
-- ceil(x × 1.10) = priceUsd (968 → 880, 1007 → 915, 528 → 480). Prices no whole x maps to stay NULL.
UPDATE "Product" AS p
SET "basePriceUsd" = c.x
FROM (
  SELECT id, floor(("priceUsd" - 1) * 100 / 110) + 1 AS x
  FROM "Product"
  WHERE "priceUsd" IS NOT NULL AND "priceUsd" >= 1 AND "priceUsd" = trunc("priceUsd")
) AS c
WHERE p.id = c.id AND ceil(c.x * 110 / 100.0) = p."priceUsd";
