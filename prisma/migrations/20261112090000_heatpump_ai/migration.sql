-- Additive: teplonasos AI-first ("odamdek"). Two columns with defaults, nothing else changes. Backup first
-- (npm run backup:crm).

-- AlterTable
ALTER TABLE "InstagramComment" ADD COLUMN "heatPumpKw" INTEGER;
ALTER TABLE "SiteSettings" ADD COLUMN "heatPumpAi" BOOLEAN NOT NULL DEFAULT true;
