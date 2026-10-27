-- Additive: soft delete of Kassa entries (two nullable columns). Backup first (npm run backup:crm).

-- AlterTable
ALTER TABLE "KassaEntry" ADD COLUMN     "deleteReason" VARCHAR(200),
ADD COLUMN     "deletedById" TEXT;

-- AddForeignKey
ALTER TABLE "KassaEntry" ADD CONSTRAINT "KassaEntry_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

