-- CreateEnum
CREATE TYPE "CustomerContactResult" AS ENUM ('CALLED', 'NO_ANSWER', 'LATER', 'AWAITING_PURCHASE');

-- CreateEnum
CREATE TYPE "CustomerPurchaseStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "AdminRole" ADD VALUE 'SELLER';

-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN     "salesPersonId" TEXT;

-- AlterTable
ALTER TABLE "RegularCustomer" ADD COLUMN     "callIntervalDays" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "lastPurchaseAt" TIMESTAMP(3),
ADD COLUMN     "nextContactAt" TIMESTAMP(3),
ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "phoneNormalized" VARCHAR(16);

-- AlterTable
ALTER TABLE "SalesPerson" ADD COLUMN     "telegramChatId" VARCHAR(32);

-- CreateTable
CREATE TABLE "CustomerContact" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "sellerId" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" "CustomerContactResult" NOT NULL,
    "note" TEXT,
    "nextContactAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerPurchase" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "sellerId" TEXT,
    "date" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" "MoneyCurrency" NOT NULL,
    "amountUzs" DECIMAL(20,2),
    "amountUsd" DECIMAL(18,2) NOT NULL,
    "note" TEXT,
    "status" "CustomerPurchaseStatus" NOT NULL DEFAULT 'PENDING',
    "rejectReason" TEXT,
    "createdByUserId" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerContact_customerId_at_idx" ON "CustomerContact"("customerId", "at");

-- CreateIndex
CREATE INDEX "CustomerContact_sellerId_at_idx" ON "CustomerContact"("sellerId", "at");

-- CreateIndex
CREATE INDEX "CustomerPurchase_status_createdAt_idx" ON "CustomerPurchase"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerPurchase_customerId_date_idx" ON "CustomerPurchase"("customerId", "date");

-- CreateIndex
CREATE INDEX "CustomerPurchase_sellerId_status_idx" ON "CustomerPurchase"("sellerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_salesPersonId_key" ON "AdminUser"("salesPersonId");

-- CreateIndex
CREATE UNIQUE INDEX "RegularCustomer_phoneNormalized_key" ON "RegularCustomer"("phoneNormalized");

-- CreateIndex
CREATE INDEX "RegularCustomer_ownerId_isActive_idx" ON "RegularCustomer"("ownerId", "isActive");

-- AddForeignKey
ALTER TABLE "AdminUser" ADD CONSTRAINT "AdminUser_salesPersonId_fkey" FOREIGN KEY ("salesPersonId") REFERENCES "SalesPerson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegularCustomer" ADD CONSTRAINT "RegularCustomer_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "SalesPerson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerContact" ADD CONSTRAINT "CustomerContact_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "RegularCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerContact" ADD CONSTRAINT "CustomerContact_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "SalesPerson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPurchase" ADD CONSTRAINT "CustomerPurchase_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "RegularCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPurchase" ADD CONSTRAINT "CustomerPurchase_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "SalesPerson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPurchase" ADD CONSTRAINT "CustomerPurchase_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPurchase" ADD CONSTRAINT "CustomerPurchase_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill (fills only the new, empty columns; existing values are not changed).
-- phoneNormalized: "+998XXXXXXXXX" from the free-text phone, same rule as lib/auth/phone.ts; numbers that two
-- customers share are left NULL so the unique index cannot fail (admin resolves them in the form).
WITH digits AS (
  SELECT id, regexp_replace(coalesce(phone, ''), '\D', '', 'g') AS d FROM "RegularCustomer" WHERE phone IS NOT NULL
), normalized AS (
  SELECT id, '+' || CASE WHEN length(d) = 9 THEN '998' || d ELSE d END AS phone FROM digits
  WHERE (length(d) = 9) OR (length(d) = 12 AND d LIKE '998%')
), unique_phones AS (
  SELECT id, phone FROM (SELECT id, phone, count(*) OVER (PARTITION BY phone) AS n FROM normalized) x WHERE n = 1
)
UPDATE "RegularCustomer" c SET "phoneNormalized" = u.phone FROM unique_phones u WHERE c.id = u.id AND c."phoneNormalized" IS NULL;

-- lastPurchaseAt: end of the latest month with an entered sale (not later than now).
UPDATE "RegularCustomer" c SET "lastPurchaseAt" = s.last
FROM (
  SELECT "customerId", least(now(), max(make_date(year, month, 1) + interval '1 month' - interval '1 day')) AS last
  FROM "RegularCustomerMonthlySale" GROUP BY "customerId"
) s
WHERE c.id = s."customerId" AND c."lastPurchaseAt" IS NULL;
