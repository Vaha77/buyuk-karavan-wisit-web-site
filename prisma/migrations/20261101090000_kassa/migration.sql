-- Additive: Kassa (new tables and enums only). No existing table is changed.
-- Backup first (npm run backup:crm); this migration adds rows only to the new KassaCategory table.

-- CreateEnum
CREATE TYPE "KassaType" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "KassaPayment" AS ENUM ('CASH', 'CARD', 'BANK');

-- CreateTable
CREATE TABLE "KassaCategory" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "type" "KassaType" NOT NULL,
    "icon" VARCHAR(8),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "KassaCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KassaEntry" (
    "id" TEXT NOT NULL,
    "type" "KassaType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" "MoneyCurrency" NOT NULL,
    "categoryId" TEXT NOT NULL,
    "paymentType" "KassaPayment" NOT NULL,
    "note" VARCHAR(300) NOT NULL,
    "receiptUrl" VARCHAR(500),
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "KassaEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KassaEntryLog" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KassaEntryLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KassaSettings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "openingUsd" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "openingUzs" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "openingDate" DATE NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KassaSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KassaEntry_occurredAt_idx" ON "KassaEntry"("occurredAt");

-- CreateIndex
CREATE INDEX "KassaEntryLog_entryId_createdAt_idx" ON "KassaEntryLog"("entryId", "createdAt");

-- AddForeignKey
ALTER TABLE "KassaEntry" ADD CONSTRAINT "KassaEntry_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "KassaCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KassaEntry" ADD CONSTRAINT "KassaEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KassaEntryLog" ADD CONSTRAINT "KassaEntryLog_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "KassaEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KassaEntryLog" ADD CONSTRAINT "KassaEntryLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Starting categories (the Super Admin adds, renames and archives them in the app).
INSERT INTO "KassaCategory" ("id", "name", "type", "icon", "sortOrder") VALUES
  ('kassa_out_goods', 'Tovar xaridi', 'OUT', '📦', 1),
  ('kassa_out_salary', 'Oylik', 'OUT', '👷', 2),
  ('kassa_out_rent', 'Ijara', 'OUT', '🏠', 3),
  ('kassa_out_utility', 'Kommunal', 'OUT', '💡', 4),
  ('kassa_out_fuel', 'Benzin', 'OUT', '⛽', 5),
  ('kassa_out_food', 'Ovqat', 'OUT', '🍽', 6),
  ('kassa_out_ads', 'Reklama', 'OUT', '📣', 7),
  ('kassa_in_sale', 'Sotuv', 'IN', '💼', 1),
  ('kassa_in_debt', 'Mijoz qarzi', 'IN', '🧾', 2),
  ('kassa_in_mount', 'Montaj', 'IN', '🔧', 3),
  ('kassa_in_seh', 'Seh', 'IN', '🏭', 4);
