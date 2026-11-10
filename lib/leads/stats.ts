import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getDb } from "@/lib/db";
import { buildLeadStats, leadPeriod, type LeadStatRow } from "./stats-rules";

/** Charts of /admin/leads: the same leads the list shows (staff only), one GROUP BY over the period and the one before it.
    region: same codes as getAdminLeads ("KZ", "UZ-NG", "NONE"). */
export async function getLeadStats(rawPeriod: string | undefined, region = "") {
  await requireAdmin();
  const period = leadPeriod(rawPeriod);
  const where = region === "NONE" ? Prisma.sql`AND l."regionCode" IS NULL` : /^[A-Z]{2}$/.test(region) ? Prisma.sql`AND l.country = ${region}` : /^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(region) ? Prisma.sql`AND l."regionCode" = ${region}` : Prisma.empty;
  const rows = await getDb().$queryRaw<Array<Omit<LeadStatRow, "price"> & { price: Prisma.Decimal | null }>>(Prisma.sql`
    SELECT date_trunc('hour', l."createdAt") AS at, l.source::text AS source, l.status::text AS status,
      coalesce(l.phone, '') <> '' AS phone, coalesce(nullif(l.product, ''), l."requestType") AS product, max(p."priceUsd") AS price, count(*)::int AS n
    FROM "Lead" l LEFT JOIN "Product" p ON p.id = l."productId"
    WHERE l."createdAt" >= ${period.prevFrom} AND l."createdAt" < ${period.to} ${where}
    GROUP BY 1, 2, 3, 4, 5`);
  return { period: period.key, stats: buildLeadStats(rows.map(row => ({ ...row, price: row.price === null ? null : Number(row.price) })), period) };
}
