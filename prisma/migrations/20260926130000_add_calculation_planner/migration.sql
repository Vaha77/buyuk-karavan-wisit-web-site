CREATE TYPE "CalculationStatus" AS ENUM ('DRAFT', 'READY');
CREATE TYPE "CalculationRoomType" AS ENUM ('ROOM', 'CORRIDOR');
CREATE TYPE "CalculationDoorSide" AS ENUM ('TOP', 'BOTTOM', 'LEFT', 'RIGHT');

CREATE TABLE "Calculation" (
    "id" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "phone" TEXT,
    "region" TEXT,
    "projectName" TEXT NOT NULL,
    "capacityTons" DECIMAL(10,2),
    "cameraCount" INTEGER NOT NULL DEFAULT 0,
    "temperatureMin" DECIMAL(6,2),
    "temperatureMax" DECIMAL(6,2),
    "notes" TEXT,
    "buildingWidth" DECIMAL(10,2) NOT NULL,
    "buildingLength" DECIMAL(10,2) NOT NULL,
    "buildingHeight" DECIMAL(10,2) NOT NULL,
    "status" "CalculationStatus" NOT NULL DEFAULT 'DRAFT',
    "createdByAdminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Calculation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CalculationRoom" (
    "id" TEXT NOT NULL,
    "calculationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CalculationRoomType" NOT NULL,
    "x" DECIMAL(10,2) NOT NULL,
    "y" DECIMAL(10,2) NOT NULL,
    "width" DECIMAL(10,2) NOT NULL,
    "length" DECIMAL(10,2) NOT NULL,
    "height" DECIMAL(10,2),
    "capacityTons" DECIMAL(10,2),
    "temperatureMin" DECIMAL(6,2),
    "temperatureMax" DECIMAL(6,2),
    "doorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "doorSide" "CalculationDoorSide",
    "order" INTEGER NOT NULL,
    CONSTRAINT "CalculationRoom_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Calculation_status_updatedAt_idx" ON "Calculation"("status", "updatedAt");
CREATE INDEX "Calculation_createdByAdminId_updatedAt_idx" ON "Calculation"("createdByAdminId", "updatedAt");
CREATE UNIQUE INDEX "CalculationRoom_calculationId_order_key" ON "CalculationRoom"("calculationId", "order");
CREATE INDEX "CalculationRoom_calculationId_idx" ON "CalculationRoom"("calculationId");
ALTER TABLE "Calculation" ADD CONSTRAINT "Calculation_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CalculationRoom" ADD CONSTRAINT "CalculationRoom_calculationId_fkey" FOREIGN KEY ("calculationId") REFERENCES "Calculation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
