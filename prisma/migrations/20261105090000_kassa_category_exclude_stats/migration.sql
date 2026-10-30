-- Additive: "Statistikaga kirmasin" on kassa categories (one column, default false; no category is marked here). Backup first (npm run backup:crm).

-- AlterTable
ALTER TABLE "KassaCategory" ADD COLUMN     "excludeFromStats" BOOLEAN NOT NULL DEFAULT false;
