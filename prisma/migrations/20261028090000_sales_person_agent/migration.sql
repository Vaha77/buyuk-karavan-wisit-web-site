-- Additive: link a SalesPerson to their Telegram SalesAgent (leads and marja on the seller dashboard).
ALTER TABLE "SalesPerson" ADD COLUMN "agentId" TEXT;
CREATE UNIQUE INDEX "SalesPerson_agentId_key" ON "SalesPerson"("agentId");
ALTER TABLE "SalesPerson" ADD CONSTRAINT "SalesPerson_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "SalesAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
