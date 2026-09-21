CREATE TABLE "ProductCategory" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "order" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("id")
);

INSERT INTO "ProductCategory" ("id", "name", "slug", "order") VALUES
('cat_compressors','Kompressorlar','compressors',0),
('cat_evaporators','Evaporatorlar','evaporators',1),
('cat_condensers','Kondensatorlar','condensers',2),
('cat_chillers','Chillerlar','chillers',3),
('cat_panels','Sandwich panellar','panels',4),
('cat_doors','Sovutish eshiklari','doors',5),
('cat_pipes','Mis quvurlar','pipes',6),
('cat_accessories','Aksessuarlar','accessories',7);

INSERT INTO "ProductCategory" ("id", "name", "slug", "order")
SELECT 'cat_' || md5(p."category"), p."category", 'category-' || substr(md5(p."category"),1,10), 100 + row_number() OVER (ORDER BY p."category")
FROM (SELECT DISTINCT "category" FROM "Product" WHERE "category" NOT IN ('compressors','evaporators','condensers','chillers','panels','doors','pipes','accessories')) p;

ALTER TABLE "Product" ADD COLUMN "categoryId" TEXT;
UPDATE "Product" SET "categoryId" = CASE "category"
  WHEN 'compressors' THEN 'cat_compressors' WHEN 'evaporators' THEN 'cat_evaporators'
  WHEN 'condensers' THEN 'cat_condensers' WHEN 'chillers' THEN 'cat_chillers'
  WHEN 'panels' THEN 'cat_panels' WHEN 'doors' THEN 'cat_doors'
  WHEN 'pipes' THEN 'cat_pipes' WHEN 'accessories' THEN 'cat_accessories'
  ELSE 'cat_' || md5("category") END;
ALTER TABLE "Product" ALTER COLUMN "categoryId" SET NOT NULL;
DROP INDEX IF EXISTS "Product_category_idx";
ALTER TABLE "Product" DROP COLUMN "category";

CREATE UNIQUE INDEX "ProductCategory_name_key" ON "ProductCategory"("name");
CREATE UNIQUE INDEX "ProductCategory_slug_key" ON "ProductCategory"("slug");
CREATE INDEX "ProductCategory_isActive_order_idx" ON "ProductCategory"("isActive", "order");
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
