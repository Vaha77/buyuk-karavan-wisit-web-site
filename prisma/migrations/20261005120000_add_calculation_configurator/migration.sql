-- Komplekt konfiguratori: calculation ↔ customer / lead and the configurator snapshot. Additive only.
-- AlterTable
ALTER TABLE "Calculation" ADD COLUMN     "configurator" JSONB,
ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "leadId" TEXT;

-- CreateIndex
CREATE INDEX "Calculation_customerId_idx" ON "Calculation"("customerId");

-- CreateIndex
CREATE INDEX "Calculation_leadId_idx" ON "Calculation"("leadId");

-- AddForeignKey
ALTER TABLE "Calculation" ADD CONSTRAINT "Calculation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "RegularCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Calculation" ADD CONSTRAINT "Calculation_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

