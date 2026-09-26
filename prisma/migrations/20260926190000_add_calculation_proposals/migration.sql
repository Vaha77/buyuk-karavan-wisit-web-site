ALTER TYPE "CalculationStatus" ADD VALUE IF NOT EXISTS 'SENT';
ALTER TYPE "CalculationStatus" ADD VALUE IF NOT EXISTS 'NEGOTIATION';
ALTER TYPE "CalculationStatus" ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE "CalculationStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

CREATE TYPE "CalculationConfigurationType" AS ENUM ('RECOMMENDED', 'MARKET_1', 'MARKET_2');
CREATE TYPE "CalculationCurrency" AS ENUM ('USD', 'UZS');

ALTER TABLE "Calculation"
  ADD COLUMN "electricityTariff" DECIMAL(18,2), ADD COLUMN "specialistConclusion" TEXT,
  ADD COLUMN "proposalNumber" TEXT, ADD COLUMN "proposalDate" TIMESTAMP(3), ADD COLUMN "validityDays" INTEGER,
  ADD COLUMN "paymentTerms" TEXT, ADD COLUMN "deliveryTerms" TEXT,
  ADD COLUMN "installationIncluded" BOOLEAN, ADD COLUMN "transportIncluded" BOOLEAN,
  ADD COLUMN "commissioningIncluded" BOOLEAN, ADD COLUMN "warranty" TEXT,
  ADD COLUMN "commercialNotes" TEXT, ADD COLUMN "discountPercent" DECIMAL(8,4);
CREATE UNIQUE INDEX "Calculation_proposalNumber_key" ON "Calculation"("proposalNumber");

CREATE TABLE "CalculationConfiguration" (
  "id" TEXT NOT NULL, "calculationId" TEXT NOT NULL, "type" "CalculationConfigurationType" NOT NULL,
  "label" TEXT NOT NULL, "compressor" TEXT, "compressorNote" TEXT, "condenser" TEXT, "condenserNote" TEXT,
  "evaporator" TEXT, "evaporatorNote" TEXT, "refrigerant" TEXT, "electricalPanel" TEXT, "trv" TEXT,
  "copperPipe" TEXT, "fittings" TEXT, "freon" TEXT, "installationAccessories" TEXT, "includedEquipment" TEXT,
  "priceUsd" DECIMAL(18,2), "powerKw" DECIMAL(12,3), "operatingHoursPerDay" DECIMAL(8,2), "order" INTEGER NOT NULL,
  CONSTRAINT "CalculationConfiguration_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CalculationLineItem" (
  "id" TEXT NOT NULL, "calculationId" TEXT NOT NULL, "productId" TEXT, "name" TEXT NOT NULL, "unit" TEXT NOT NULL,
  "quantity" DECIMAL(18,3) NOT NULL, "unitPrice" DECIMAL(18,2) NOT NULL, "currency" "CalculationCurrency" NOT NULL,
  "order" INTEGER NOT NULL, CONSTRAINT "CalculationLineItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CalculationConfiguration_calculationId_type_key" ON "CalculationConfiguration"("calculationId", "type");
CREATE UNIQUE INDEX "CalculationConfiguration_calculationId_order_key" ON "CalculationConfiguration"("calculationId", "order");
CREATE INDEX "CalculationConfiguration_calculationId_idx" ON "CalculationConfiguration"("calculationId");
CREATE UNIQUE INDEX "CalculationLineItem_calculationId_order_key" ON "CalculationLineItem"("calculationId", "order");
CREATE INDEX "CalculationLineItem_calculationId_idx" ON "CalculationLineItem"("calculationId");
CREATE INDEX "CalculationLineItem_productId_idx" ON "CalculationLineItem"("productId");
ALTER TABLE "CalculationConfiguration" ADD CONSTRAINT "CalculationConfiguration_calculationId_fkey" FOREIGN KEY ("calculationId") REFERENCES "Calculation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalculationLineItem" ADD CONSTRAINT "CalculationLineItem_calculationId_fkey" FOREIGN KEY ("calculationId") REFERENCES "Calculation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalculationLineItem" ADD CONSTRAINT "CalculationLineItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
