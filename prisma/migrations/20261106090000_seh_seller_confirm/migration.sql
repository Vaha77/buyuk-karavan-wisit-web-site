-- Additive: "Sotuvchi nomidan zakaz" — the seller's answer to an order the workshop entered for them (all columns nullable; old rows stay null). Backup first (npm run backup:crm).

-- CreateEnum
CREATE TYPE "SellerConfirm" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

-- AlterTable
ALTER TABLE "WorkshopOrder" ADD COLUMN     "sellerConfirm" "SellerConfirm",
ADD COLUMN     "sellerRejectReason" VARCHAR(300),
ADD COLUMN     "sellerRemindedAt" TIMESTAMP(3),
ADD COLUMN     "sellerMessageId" INTEGER,
ADD COLUMN     "sellerRejectResolvedAt" TIMESTAMP(3);
