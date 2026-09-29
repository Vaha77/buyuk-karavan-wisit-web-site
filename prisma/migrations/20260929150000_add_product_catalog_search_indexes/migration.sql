-- Additive indexes for the 1000+ product public catalog.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "Product_isVisible_categoryId_idx"
ON "Product"("isVisible", "categoryId");

CREATE INDEX "Product_catalog_search_trgm_idx"
ON "Product" USING GIN (
  (lower(coalesce("name", '') || ' ' || coalesce("brand", '') || ' ' || coalesce("model", '') || ' ' || coalesce("slug", ''))) gin_trgm_ops
);

CREATE INDEX "Product_model_normalized_trgm_idx"
ON "Product" USING GIN (
  (regexp_replace(lower("model"), '[^a-z0-9]+', '', 'g')) gin_trgm_ops
);
