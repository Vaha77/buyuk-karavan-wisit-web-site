-- Additive: country/region on each purchase (snapshot of the customer's location).
ALTER TABLE "CustomerPurchase" ADD COLUMN "country" VARCHAR(8),
ADD COLUMN "regionCode" VARCHAR(16);

-- Customers without a region: take it from a lead with the same phone (latest first).
UPDATE "RegularCustomer" c SET "country" = l."country", "regionCode" = l."regionCode"
FROM (
  SELECT DISTINCT ON (digits) digits, "country", "regionCode" FROM (
    SELECT '+' || CASE WHEN length(d) = 9 THEN '998' || d ELSE d END AS digits, "country", "regionCode", "createdAt"
    FROM (SELECT regexp_replace(coalesce("phone", ''), '\D', '', 'g') AS d, "country", "regionCode", "createdAt" FROM "Lead" WHERE "regionCode" IS NOT NULL AND "country" IS NOT NULL) raw
  ) p ORDER BY digits, "createdAt" DESC
) l
WHERE c."regionCode" IS NULL AND c."phoneNormalized" = l.digits;

-- Existing purchases: the customer's current location is the best guess.
UPDATE "CustomerPurchase" p SET "country" = c."country", "regionCode" = c."regionCode"
FROM "RegularCustomer" c WHERE p."customerId" = c.id AND p."regionCode" IS NULL;
