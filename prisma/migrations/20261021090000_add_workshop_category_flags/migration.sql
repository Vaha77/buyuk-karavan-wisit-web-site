-- Additive: Seh flags on product categories (Prays → Kategoriyalar) and the standard condenser category. New columns only;
-- defaults are "off", so nothing is marked automatically.
-- AlterTable
ALTER TABLE "ProductCategory" ADD COLUMN "workshopAssembly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "workshopIssue" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "workshopRole" VARCHAR(20);

-- AlterTable
ALTER TABLE "SiteSettings" ADD COLUMN "standardCondenserCategoryId" VARCHAR(40);
