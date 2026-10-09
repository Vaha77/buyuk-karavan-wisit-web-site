-- Seh: soft cancel (CANCELLED + who/when/why) and a one-time requestId against double submits. Additive only.
-- AlterEnum
ALTER TYPE "WorkshopOrderStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "WorkshopOrder" ADD COLUMN     "cancelReason" VARCHAR(300),
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledById" TEXT,
ADD COLUMN     "requestId" VARCHAR(64);

-- CreateIndex
CREATE UNIQUE INDEX "WorkshopOrder_requestId_key" ON "WorkshopOrder"("requestId");

-- AddForeignKey
ALTER TABLE "WorkshopOrder" ADD CONSTRAINT "WorkshopOrder_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

