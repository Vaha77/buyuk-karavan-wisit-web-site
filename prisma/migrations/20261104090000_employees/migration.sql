-- Additive: Hodimlar tables, optional hodim on kassa entries and bot drafts, the "Hodimdan" category. Backup first (npm run backup:crm).

-- CreateEnum
CREATE TYPE "EmployeeDebtType" AS ENUM ('DEBT', 'PAYMENT', 'OPENING');

-- AlterTable
ALTER TABLE "KassaDraft" ADD COLUMN     "employeeId" TEXT;

-- AlterTable
ALTER TABLE "KassaEntry" ADD COLUMN     "employeeId" TEXT;

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "position" VARCHAR(100),
    "phone" VARCHAR(32),
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeDebtEntry" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "EmployeeDebtType" NOT NULL,
    "amountUsd" DECIMAL(18,2) NOT NULL,
    "note" VARCHAR(300) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deleteReason" VARCHAR(200),
    "kassaEntryId" TEXT,

    CONSTRAINT "EmployeeDebtEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeDebtLog" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeDebtLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeDebtEntry_kassaEntryId_key" ON "EmployeeDebtEntry"("kassaEntryId");

-- CreateIndex
CREATE INDEX "EmployeeDebtEntry_employeeId_occurredAt_idx" ON "EmployeeDebtEntry"("employeeId", "occurredAt");

-- CreateIndex
CREATE INDEX "EmployeeDebtLog_entryId_createdAt_idx" ON "EmployeeDebtLog"("entryId", "createdAt");

-- CreateIndex
CREATE INDEX "KassaEntry_employeeId_idx" ON "KassaEntry"("employeeId");

-- AddForeignKey
ALTER TABLE "KassaEntry" ADD CONSTRAINT "KassaEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KassaDraft" ADD CONSTRAINT "KassaDraft_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDebtEntry" ADD CONSTRAINT "EmployeeDebtEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDebtEntry" ADD CONSTRAINT "EmployeeDebtEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDebtEntry" ADD CONSTRAINT "EmployeeDebtEntry_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDebtEntry" ADD CONSTRAINT "EmployeeDebtEntry_kassaEntryId_fkey" FOREIGN KEY ("kassaEntryId") REFERENCES "KassaEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDebtLog" ADD CONSTRAINT "EmployeeDebtLog_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "EmployeeDebtEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDebtLog" ADD CONSTRAINT "EmployeeDebtLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed: the kirim category that opens the hodim picker.
INSERT INTO "KassaCategory" ("id", "name", "type", "icon", "sortOrder") VALUES ('kassa_in_employee', 'Hodimdan', 'IN', '👤', 5) ON CONFLICT DO NOTHING;
