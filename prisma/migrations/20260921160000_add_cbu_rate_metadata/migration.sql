ALTER TABLE "SiteSettings"
  ADD COLUMN "currencySource" TEXT,
  ADD COLUMN "cbuNominal" INTEGER,
  ADD COLUMN "cbuEffectiveDate" TIMESTAMP(3),
  ADD COLUMN "cbuLastSyncedAt" TIMESTAMP(3);
