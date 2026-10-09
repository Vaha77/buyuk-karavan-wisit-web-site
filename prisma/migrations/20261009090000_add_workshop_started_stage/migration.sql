-- Seh: "Terilmoqda" (STARTED) stage between ACCEPTED (Navbatda) and ISSUED, and the daily start limit. Additive only;
-- existing ACCEPTED orders stay ACCEPTED (Navbatda).
-- AlterEnum
ALTER TYPE "WorkshopOrderStatus" ADD VALUE 'STARTED' BEFORE 'ISSUED';

-- AlterTable
ALTER TABLE "SiteSettings" ADD COLUMN     "workshopDailyLimit" INTEGER NOT NULL DEFAULT 5;

-- AlterTable
ALTER TABLE "WorkshopOrder" ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "startedById" TEXT;

-- CreateIndex
CREATE INDEX "WorkshopOrder_startedAt_idx" ON "WorkshopOrder"("startedAt");

-- AddForeignKey
ALTER TABLE "WorkshopOrder" ADD CONSTRAINT "WorkshopOrder_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

