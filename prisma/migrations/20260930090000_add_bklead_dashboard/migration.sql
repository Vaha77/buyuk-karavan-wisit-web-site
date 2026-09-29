-- CreateEnum
CREATE TYPE "ReferralSource" AS ENUM ('YOUTUBE', 'INSTAGRAM', 'TELEGRAM', 'TIKTOK', 'GOOGLE_ADS', 'BLOGGER', 'QR', 'OTHER');

-- CreateEnum
CREATE TYPE "ReferralLinkStatus" AS ENUM ('ACTIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "VisitDevice" AS ENUM ('MOBILE', 'DESKTOP', 'TABLET');

-- CreateEnum
CREATE TYPE "VisitOutcome" AS ENUM ('LEFT', 'INTERESTED', 'CONTACT_ATTEMPT', 'LEAD', 'SALE');

-- CreateEnum
CREATE TYPE "VisitEventType" AS ENUM ('PAGEVIEW', 'PRODUCT_VIEW', 'TEL_CLICK', 'TELEGRAM_CLICK', 'MADINA_OPEN', 'FORM_SUBMIT', 'HEARTBEAT');

-- CreateEnum
CREATE TYPE "MoneyCurrency" AS ENUM ('USD', 'UZS');

-- AlterTable
ALTER TABLE "SiteSettings" ADD COLUMN     "dashboardTips" JSONB;

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "country" VARCHAR(8),
ADD COLUMN     "referralLinkId" TEXT,
ADD COLUMN     "regionCode" VARCHAR(16),
ADD COLUMN     "visitId" TEXT;

-- CreateTable
CREATE TABLE "ReferralLink" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" "ReferralSource" NOT NULL,
    "slug" VARCHAR(40) NOT NULL,
    "targetPath" TEXT NOT NULL,
    "cost" DECIMAL(18,2),
    "costCurrency" "MoneyCurrency",
    "ownerAgentId" TEXT,
    "status" "ReferralLinkStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdByAdminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferralLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Visit" (
    "id" TEXT NOT NULL,
    "referralLinkId" TEXT,
    "visitorId" VARCHAR(40) NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "country" VARCHAR(8),
    "regionCode" VARCHAR(16),
    "device" "VisitDevice" NOT NULL DEFAULT 'DESKTOP',
    "pageCount" INTEGER NOT NULL DEFAULT 0,
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "outcome" "VisitOutcome" NOT NULL DEFAULT 'LEFT',

    CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitEvent" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "type" "VisitEventType" NOT NULL,
    "path" VARCHAR(300) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegularCustomer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" VARCHAR(8) NOT NULL DEFAULT 'UZ',
    "regionCode" VARCHAR(16),
    "phone" TEXT,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegularCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegularCustomerMonthlySale" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" "MoneyCurrency" NOT NULL,
    "amountUsd" DECIMAL(18,2) NOT NULL,
    "note" TEXT,
    "createdByAdminId" TEXT NOT NULL,
    "updatedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegularCustomerMonthlySale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RankingPrize" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "place" INTEGER NOT NULL,
    "prizeText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RankingPrize_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReferralLink_slug_key" ON "ReferralLink"("slug");

-- CreateIndex
CREATE INDEX "ReferralLink_status_createdAt_idx" ON "ReferralLink"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ReferralLink_source_idx" ON "ReferralLink"("source");

-- CreateIndex
CREATE INDEX "Visit_referralLinkId_firstSeenAt_idx" ON "Visit"("referralLinkId", "firstSeenAt");

-- CreateIndex
CREATE INDEX "Visit_referralLinkId_outcome_idx" ON "Visit"("referralLinkId", "outcome");

-- CreateIndex
CREATE INDEX "Visit_visitorId_lastSeenAt_idx" ON "Visit"("visitorId", "lastSeenAt");

-- CreateIndex
CREATE INDEX "Visit_firstSeenAt_idx" ON "Visit"("firstSeenAt");

-- CreateIndex
CREATE INDEX "VisitEvent_visitId_createdAt_idx" ON "VisitEvent"("visitId", "createdAt");

-- CreateIndex
CREATE INDEX "RegularCustomer_isActive_idx" ON "RegularCustomer"("isActive");

-- CreateIndex
CREATE INDEX "RegularCustomerMonthlySale_year_month_idx" ON "RegularCustomerMonthlySale"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "RegularCustomerMonthlySale_customerId_year_month_key" ON "RegularCustomerMonthlySale"("customerId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "RankingPrize_year_place_key" ON "RankingPrize"("year", "place");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_visitId_key" ON "Lead"("visitId");

-- CreateIndex
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");

-- CreateIndex
CREATE INDEX "Lead_country_regionCode_idx" ON "Lead"("country", "regionCode");

-- CreateIndex
CREATE INDEX "Lead_referralLinkId_createdAt_idx" ON "Lead"("referralLinkId", "createdAt");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_referralLinkId_fkey" FOREIGN KEY ("referralLinkId") REFERENCES "ReferralLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralLink" ADD CONSTRAINT "ReferralLink_ownerAgentId_fkey" FOREIGN KEY ("ownerAgentId") REFERENCES "SalesAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralLink" ADD CONSTRAINT "ReferralLink_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_referralLinkId_fkey" FOREIGN KEY ("referralLinkId") REFERENCES "ReferralLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitEvent" ADD CONSTRAINT "VisitEvent_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegularCustomerMonthlySale" ADD CONSTRAINT "RegularCustomerMonthlySale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "RegularCustomer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegularCustomerMonthlySale" ADD CONSTRAINT "RegularCustomerMonthlySale_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegularCustomerMonthlySale" ADD CONSTRAINT "RegularCustomerMonthlySale_updatedByAdminId_fkey" FOREIGN KEY ("updatedByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill (best effort): derive country/regionCode from the existing free-text "region".
-- Only the new columns are written; "region" is left untouched. Unknown text stays NULL ("Aniqlanmagan").
-- Keep in sync with matchRegionText() in lib/dashboard/regions.ts.
UPDATE "Lead" SET "regionCode" = CASE
    WHEN lower("region") ~ '(toshkent|tashkent)\s*(sh\.?|shahri|shahar|city)' THEN 'UZ-TK'
    WHEN lower("region") ~ '(toshkent|tashkent)' THEN 'UZ-TO'
    WHEN lower("region") ~ '(qo.?qon|kokand|farg|ferg|marg.?ilon)' THEN 'UZ-FA'
    WHEN lower("region") ~ 'naman' THEN 'UZ-NG'
    WHEN lower("region") ~ 'andij' THEN 'UZ-AN'
    WHEN lower("region") ~ '(buxor|bukhar)' THEN 'UZ-BU'
    WHEN lower("region") ~ '(jizz|jizax|jizak)' THEN 'UZ-JI'
    WHEN lower("region") ~ '(xorazm|khorezm|horazm|urganch)' THEN 'UZ-XO'
    WHEN lower("region") ~ 'navo' THEN 'UZ-NW'
    WHEN lower("region") ~ '(qashqa|kashka|qarshi)' THEN 'UZ-QA'
    WHEN lower("region") ~ '(qoraqalp|karakalp|nukus)' THEN 'UZ-QR'
    WHEN lower("region") ~ 'samar' THEN 'UZ-SA'
    WHEN lower("region") ~ '(sirdar|syrdar|guliston)' THEN 'UZ-SI'
    WHEN lower("region") ~ '(surxon|surkhan|termiz)' THEN 'UZ-SU'
    ELSE NULL
  END
WHERE "region" IS NOT NULL AND "regionCode" IS NULL;

UPDATE "Lead" SET "country" = 'UZ' WHERE "regionCode" LIKE 'UZ-%' AND "country" IS NULL;
