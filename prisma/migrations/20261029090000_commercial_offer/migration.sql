-- Additive: "Tijorat taklifi" (KP) of sellers. New table only; no existing column changes.
CREATE TABLE "CommercialOffer" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "sellerId" TEXT NOT NULL,
    "customerId" TEXT,
    "customerName" VARCHAR(120) NOT NULL,
    "customerPhone" VARCHAR(40),
    "markupPercent" DECIMAL(6,2) NOT NULL,
    "items" JSONB NOT NULL,
    "totalUsd" DECIMAL(18,2) NOT NULL,
    "validUntil" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommercialOffer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CommercialOffer_number_key" ON "CommercialOffer"("number");
CREATE INDEX "CommercialOffer_sellerId_createdAt_idx" ON "CommercialOffer"("sellerId", "createdAt");
ALTER TABLE "CommercialOffer" ADD CONSTRAINT "CommercialOffer_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommercialOffer" ADD CONSTRAINT "CommercialOffer_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "RegularCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
