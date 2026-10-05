-- Sex zakazlari: workshop orders and their items. Additive only.
-- CreateEnum
CREATE TYPE "WorkshopOrderType" AS ENUM ('AGREGAT', 'ZAPCHAST');

-- CreateEnum
CREATE TYPE "WorkshopOrderPurpose" AS ENUM ('SHOP', 'CLIENT');

-- CreateEnum
CREATE TYPE "WorkshopOrderStatus" AS ENUM ('NEW', 'ACCEPTED', 'ISSUED', 'RECEIVED');

-- CreateEnum
CREATE TYPE "WorkshopItemKind" AS ENUM ('PRODUCT', 'PART');

-- CreateTable
CREATE TABLE "WorkshopOrder" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "type" "WorkshopOrderType" NOT NULL,
    "purpose" "WorkshopOrderPurpose" NOT NULL,
    "customerName" TEXT,
    "customerId" TEXT,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "dueDate" DATE,
    "note" TEXT,
    "sellerId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "noRequest" BOOLEAN NOT NULL DEFAULT false,
    "sellerConfirmedAt" TIMESTAMP(3),
    "status" "WorkshopOrderStatus" NOT NULL DEFAULT 'NEW',
    "acceptedById" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "issuedById" TEXT,
    "issuedAt" TIMESTAMP(3),
    "receivedById" TEXT,
    "receivedAt" TIMESTAMP(3),
    "priceSnapshot" JSONB,
    "telegramChatId" VARCHAR(32),
    "telegramMessageId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkshopOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkshopOrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "kind" "WorkshopItemKind" NOT NULL,
    "productId" TEXT,
    "partId" TEXT,
    "title" TEXT NOT NULL,
    "options" JSONB,
    "qty" INTEGER NOT NULL,
    "issuedQty" INTEGER,
    "baseUsd" DECIMAL(18,2),
    "changedFromStandard" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WorkshopOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkshopOrder_number_key" ON "WorkshopOrder"("number");

-- CreateIndex
CREATE INDEX "WorkshopOrder_status_createdAt_idx" ON "WorkshopOrder"("status", "createdAt");

-- CreateIndex
CREATE INDEX "WorkshopOrder_sellerId_createdAt_idx" ON "WorkshopOrder"("sellerId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkshopOrder_createdAt_idx" ON "WorkshopOrder"("createdAt");

-- CreateIndex
CREATE INDEX "WorkshopOrderItem_orderId_idx" ON "WorkshopOrderItem"("orderId");

-- CreateIndex
CREATE INDEX "WorkshopOrderItem_productId_idx" ON "WorkshopOrderItem"("productId");

-- CreateIndex
CREATE INDEX "WorkshopOrderItem_partId_idx" ON "WorkshopOrderItem"("partId");

-- AddForeignKey
ALTER TABLE "WorkshopOrder" ADD CONSTRAINT "WorkshopOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "RegularCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopOrder" ADD CONSTRAINT "WorkshopOrder_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopOrder" ADD CONSTRAINT "WorkshopOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopOrder" ADD CONSTRAINT "WorkshopOrder_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopOrder" ADD CONSTRAINT "WorkshopOrder_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopOrder" ADD CONSTRAINT "WorkshopOrder_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopOrderItem" ADD CONSTRAINT "WorkshopOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "WorkshopOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopOrderItem" ADD CONSTRAINT "WorkshopOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopOrderItem" ADD CONSTRAINT "WorkshopOrderItem_partId_fkey" FOREIGN KEY ("partId") REFERENCES "SexPart"("id") ON DELETE SET NULL ON UPDATE CASCADE;

