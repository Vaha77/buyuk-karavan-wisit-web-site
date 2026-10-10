-- Additive: test flag on workshop orders (default false, existing rows stay real orders).
ALTER TABLE "WorkshopOrder" ADD COLUMN "isTest" BOOLEAN NOT NULL DEFAULT false;
