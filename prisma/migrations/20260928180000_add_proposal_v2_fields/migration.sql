ALTER TABLE "Calculation"
  ADD COLUMN "renderImageUrl" TEXT,
  ADD COLUMN "manualUzsTotalWithVat" DECIMAL(18,2),
  ADD COLUMN "proposalNote" TEXT;

ALTER TABLE "CalculationRoom"
  ADD COLUMN "equipmentModel" TEXT;
