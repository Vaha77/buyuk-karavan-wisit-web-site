-- CreateEnum
CREATE TYPE "SalesPersonKind" AS ENUM ('EMPLOYEE', 'BRANCH');

-- CreateTable
CREATE TABLE "SalesPerson" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "SalesPersonKind" NOT NULL DEFAULT 'EMPLOYEE',
    "branchHead" TEXT,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesPerson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesPeriod" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startYear" INTEGER NOT NULL,
    "startMonth" INTEGER NOT NULL,
    "monthCount" INTEGER NOT NULL DEFAULT 6,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesPlan" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "planUsd" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesMonthly" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "amountUsd" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesMonthly_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalesPerson_isActive_sortOrder_idx" ON "SalesPerson"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "SalesPeriod_startYear_startMonth_key" ON "SalesPeriod"("startYear", "startMonth");

-- CreateIndex
CREATE INDEX "SalesPlan_personId_idx" ON "SalesPlan"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesPlan_periodId_personId_key" ON "SalesPlan"("periodId", "personId");

-- CreateIndex
CREATE INDEX "SalesMonthly_year_month_idx" ON "SalesMonthly"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "SalesMonthly_personId_year_month_key" ON "SalesMonthly"("personId", "year", "month");

-- AddForeignKey
ALTER TABLE "SalesPlan" ADD CONSTRAINT "SalesPlan_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "SalesPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesPlan" ADD CONSTRAINT "SalesPlan_personId_fkey" FOREIGN KEY ("personId") REFERENCES "SalesPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesMonthly" ADD CONSTRAINT "SalesMonthly_personId_fkey" FOREIGN KEY ("personId") REFERENCES "SalesPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
