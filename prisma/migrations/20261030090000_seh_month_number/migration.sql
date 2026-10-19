-- Additive: monthly "MM-NN" numbers for Seh zakazlari + "Tuzatish so'rash" requests. The global "number" stays.
-- Backup first (see the report): every WorkshopOrder row as JSON.
ALTER TABLE "WorkshopOrder" ADD COLUMN "monthKey" VARCHAR(7);
ALTER TABLE "WorkshopOrder" ADD COLUMN "monthNo" INTEGER;
ALTER TABLE "WorkshopOrder" ADD COLUMN "carriedFrom" VARCHAR(8);

-- Existing orders: their own Tashkent month by createdAt, 01, 02… in the old number order.
UPDATE "WorkshopOrder" o SET "monthKey" = b.mk, "monthNo" = b.rn
FROM (
  SELECT "id", to_char("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM') AS mk,
         row_number() OVER (PARTITION BY to_char("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM') ORDER BY "number") AS rn
  FROM "WorkshopOrder"
) b
WHERE o."id" = b."id";

ALTER TABLE "WorkshopOrder" ALTER COLUMN "monthKey" SET NOT NULL;
ALTER TABLE "WorkshopOrder" ALTER COLUMN "monthNo" SET NOT NULL;
CREATE UNIQUE INDEX "WorkshopOrder_monthKey_monthNo_key" ON "WorkshopOrder"("monthKey", "monthNo");

CREATE TYPE "WorkshopCorrectionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TABLE "WorkshopCorrectionRequest" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "status" "WorkshopCorrectionStatus" NOT NULL DEFAULT 'PENDING',
    "rejectReason" VARCHAR(300),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    CONSTRAINT "WorkshopCorrectionRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WorkshopCorrectionRequest_status_createdAt_idx" ON "WorkshopCorrectionRequest"("status", "createdAt");
CREATE INDEX "WorkshopCorrectionRequest_orderId_idx" ON "WorkshopCorrectionRequest"("orderId");
ALTER TABLE "WorkshopCorrectionRequest" ADD CONSTRAINT "WorkshopCorrectionRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "WorkshopOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkshopCorrectionRequest" ADD CONSTRAINT "WorkshopCorrectionRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkshopCorrectionRequest" ADD CONSTRAINT "WorkshopCorrectionRequest_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
