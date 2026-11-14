-- Additive: Import buyurtma (new tables + one nullable SiteSettings column). Nothing existing changes. Backup first
-- (npm run backup:crm) and a Neon snapshot.

-- CreateEnum
CREATE TYPE "ImportOrderStatus" AS ENUM ('PENDING', 'APPROVED', 'RETURNED', 'REJECTED', 'SENT');

-- AlterTable
ALTER TABLE "SiteSettings" ADD COLUMN     "importApproverId" VARCHAR(40);

-- CreateTable
CREATE TABLE "ImportCategory" (
    "id" TEXT NOT NULL,
    "nameUz" TEXT NOT NULL,
    "nameEn" TEXT,
    "parentId" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportAgent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportCatalog" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "sourceFile" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportProduct" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "catalogId" TEXT NOT NULL,
    "groupEn" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameUz" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "type" VARCHAR(10) NOT NULL,
    "specs" JSONB NOT NULL,
    "imageUrl" TEXT,
    "catPage" VARCHAR(10),
    "flag" TEXT,
    "priceAmount" DECIMAL(12,2),
    "priceCurrency" VARCHAR(3),
    "moq" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportOrder" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "requestId" VARCHAR(40),
    "sellerId" TEXT NOT NULL,
    "status" "ImportOrderStatus" NOT NULL DEFAULT 'PENDING',
    "client" TEXT,
    "neededBy" DATE,
    "comment" TEXT,
    "approverId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportOrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "approvedQty" INTEGER,

    CONSTRAINT "ImportOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportCategory_parentId_idx" ON "ImportCategory"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportAgent_name_key" ON "ImportAgent"("name");

-- CreateIndex
CREATE INDEX "ImportCatalog_categoryId_idx" ON "ImportCatalog"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportCatalog_agentId_code_key" ON "ImportCatalog"("agentId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ImportProduct_code_key" ON "ImportProduct"("code");

-- CreateIndex
CREATE INDEX "ImportProduct_catalogId_active_idx" ON "ImportProduct"("catalogId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "ImportOrder_number_key" ON "ImportOrder"("number");

-- CreateIndex
CREATE UNIQUE INDEX "ImportOrder_requestId_key" ON "ImportOrder"("requestId");

-- CreateIndex
CREATE INDEX "ImportOrder_sellerId_createdAt_idx" ON "ImportOrder"("sellerId", "createdAt");

-- CreateIndex
CREATE INDEX "ImportOrder_status_idx" ON "ImportOrder"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ImportOrderItem_orderId_productId_key" ON "ImportOrderItem"("orderId", "productId");

-- AddForeignKey
ALTER TABLE "ImportCategory" ADD CONSTRAINT "ImportCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ImportCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportCatalog" ADD CONSTRAINT "ImportCatalog_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "ImportAgent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportCatalog" ADD CONSTRAINT "ImportCatalog_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ImportCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportProduct" ADD CONSTRAINT "ImportProduct_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "ImportCatalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportOrder" ADD CONSTRAINT "ImportOrder_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportOrder" ADD CONSTRAINT "ImportOrder_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportOrderItem" ADD CONSTRAINT "ImportOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ImportOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportOrderItem" ADD CONSTRAINT "ImportOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "ImportProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

