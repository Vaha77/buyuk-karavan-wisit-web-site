CREATE TABLE "AiPriceList" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "sheetName" TEXT NOT NULL,
    "blockKey" TEXT NOT NULL,
    "blockLabel" TEXT NOT NULL,
    "parsed" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByAdminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiPriceList_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiPriceList_isActive_createdAt_idx" ON "AiPriceList"("isActive", "createdAt");
CREATE INDEX "AiPriceList_createdByAdminId_createdAt_idx" ON "AiPriceList"("createdByAdminId", "createdAt");
ALTER TABLE "AiPriceList" ADD CONSTRAINT "AiPriceList_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
