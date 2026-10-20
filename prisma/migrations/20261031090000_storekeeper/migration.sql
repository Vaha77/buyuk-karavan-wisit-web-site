-- Additive: Omborchi (STOREKEEPER) role and the store stage of Seh zakazlari. Nothing is changed or removed.
-- Backup first: every WorkshopOrder / WorkshopOrderMessage row as JSON (scripts/backup-crm.mjs or a JSON dump).
ALTER TYPE "AdminRole" ADD VALUE 'STOREKEEPER';
ALTER TYPE "WorkshopOrderStatus" ADD VALUE 'RECEIVED_STORE';
ALTER TYPE "WorkshopOrderStatus" ADD VALUE 'CLIENT_LOADED';

ALTER TABLE "WorkshopOrder" ADD COLUMN "receivedQty" INTEGER;
ALTER TABLE "WorkshopOrder" ADD COLUMN "receivedNote" VARCHAR(300);
ALTER TABLE "WorkshopOrder" ADD COLUMN "receivedCheckedAt" TIMESTAMP(3);
ALTER TABLE "WorkshopOrder" ADD COLUMN "receiveRemindedAt" TIMESTAMP(3);
ALTER TABLE "WorkshopOrder" ADD COLUMN "loadedById" TEXT;
ALTER TABLE "WorkshopOrder" ADD COLUMN "loadedAt" TIMESTAMP(3);
ALTER TABLE "WorkshopOrder" ADD COLUMN "loadedCar" VARCHAR(20);
ALTER TABLE "WorkshopOrder" ADD COLUMN "loadedPhotoUrl" VARCHAR(500);
ALTER TABLE "WorkshopOrder" ADD CONSTRAINT "WorkshopOrder_loadedById_fkey" FOREIGN KEY ("loadedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkshopOrderMessage" ADD COLUMN "store" BOOLEAN NOT NULL DEFAULT false;
