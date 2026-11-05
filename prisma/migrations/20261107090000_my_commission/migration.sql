-- Additive: "Mening foizim" (two new tables; no existing table changes). Backup first (npm run backup:crm).


-- CreateTable
CREATE TABLE "MyCommission" (
    "id" TEXT NOT NULL,
    "fromName" VARCHAR(100) NOT NULL,
    "amountUsd" DECIMAL(18,2) NOT NULL,
    "baseAmountUsd" DECIMAL(18,2),
    "percent" DECIMAL(6,3),
    "note" VARCHAR(300),
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deleteReason" VARCHAR(200),

    CONSTRAINT "MyCommission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MyCommissionLog" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MyCommissionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MyCommission_occurredAt_idx" ON "MyCommission"("occurredAt");

-- CreateIndex
CREATE INDEX "MyCommissionLog_entryId_createdAt_idx" ON "MyCommissionLog"("entryId", "createdAt");

-- AddForeignKey
ALTER TABLE "MyCommission" ADD CONSTRAINT "MyCommission_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MyCommission" ADD CONSTRAINT "MyCommission_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MyCommissionLog" ADD CONSTRAINT "MyCommissionLog_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "MyCommission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MyCommissionLog" ADD CONSTRAINT "MyCommissionLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

