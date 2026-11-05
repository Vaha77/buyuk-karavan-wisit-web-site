-- Additive: "Mening foizim" kirim/chiqim columns (defaults keep every existing row as IN / OTHER_IN) and the ShopShortage tables. Backup first (npm run backup:crm).

-- CreateEnum
CREATE TYPE "CommissionDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "CommissionKind" AS ENUM ('SELLER_COMMISSION', 'OTHER_IN', 'SALARY', 'OTHER_OUT');

-- CreateEnum
CREATE TYPE "ShortageType" AS ENUM ('OPENING', 'ADD', 'ADJUST');

-- AlterTable
ALTER TABLE "MyCommission" ADD COLUMN     "category" VARCHAR(60),
ADD COLUMN     "direction" "CommissionDirection" NOT NULL DEFAULT 'IN',
ADD COLUMN     "kind" "CommissionKind" NOT NULL DEFAULT 'OTHER_IN',
ADD COLUMN     "salaryMonth" VARCHAR(7),
ADD COLUMN     "sellerId" TEXT,
ADD COLUMN     "storekeeperId" TEXT;

-- CreateTable
CREATE TABLE "ShopShortage" (
    "id" TEXT NOT NULL,
    "type" "ShortageType" NOT NULL,
    "amountUsd" DECIMAL(18,2) NOT NULL,
    "note" VARCHAR(300) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deleteReason" VARCHAR(200),

    CONSTRAINT "ShopShortage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopShortageLog" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopShortageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShopShortage_occurredAt_idx" ON "ShopShortage"("occurredAt");

-- CreateIndex
CREATE INDEX "ShopShortageLog_entryId_createdAt_idx" ON "ShopShortageLog"("entryId", "createdAt");

-- AddForeignKey
ALTER TABLE "MyCommission" ADD CONSTRAINT "MyCommission_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MyCommission" ADD CONSTRAINT "MyCommission_storekeeperId_fkey" FOREIGN KEY ("storekeeperId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopShortage" ADD CONSTRAINT "ShopShortage_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopShortage" ADD CONSTRAINT "ShopShortage_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopShortageLog" ADD CONSTRAINT "ShopShortageLog_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "ShopShortage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopShortageLog" ADD CONSTRAINT "ShopShortageLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

