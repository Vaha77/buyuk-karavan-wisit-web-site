ALTER TYPE "LeadSource" ADD VALUE 'PRODUCT_CONSULTATION';

ALTER TABLE "Lead"
ADD COLUMN "productId" TEXT,
ADD COLUMN "productSlug" TEXT;

CREATE INDEX "Lead_productId_idx" ON "Lead"("productId");
