CREATE TYPE "Product360Status" AS ENUM ('DRAFT', 'PROCESSING', 'READY', 'FAILED');

CREATE TABLE "Product360Asset" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "status" "Product360Status" NOT NULL DEFAULT 'DRAFT',
    "sourceImages" JSONB NOT NULL DEFAULT '{}',
    "frames" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "frameCount" INTEGER NOT NULL DEFAULT 0,
    "posterImage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Product360Asset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Product360Asset_productId_key" ON "Product360Asset"("productId");
CREATE INDEX "Product360Asset_status_idx" ON "Product360Asset"("status");
ALTER TABLE "Product360Asset" ADD CONSTRAINT "Product360Asset_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
