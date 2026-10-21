import "server-only";
import { Prisma, type AdminUser } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { myDueCustomers } from "@/lib/customers/seller-queries";
import { referralLinksAreNew } from "@/lib/referrals/rules";
import { sexBadgeCount } from "@/lib/sex/queries";

/** Badge counts for the sidebar of whichever role is signed in (each role only queries what its menu shows). */
export async function getShellData(user: AdminUser) {
  if (user.role === "SELLER") {
    const due = user.salesPersonId ? (await myDueCustomers(user).catch(error => { console.error("[shell-data] seller due count failed", error); return []; })).length : 0;
    return { dueToday: due };
  }
  if (user.role === "WORKSHOP" || user.role === "STOREKEEPER") return { sexBadge: await sexBadgeCount(user) };
  const canReview = user.role === "SUPER_ADMIN" || user.role === "ADMIN";
  // One round-trip for the admin badges (runs on every admin page).
  const counts = getDb().$queryRaw<Array<{ leads: number; purchases: number; corrections: number }>>(Prisma.sql`SELECT
    (SELECT count(*) FROM "Lead" WHERE status = 'NEW')::int AS leads,
    ${canReview ? Prisma.sql`(SELECT count(*) FROM "CustomerPurchase" WHERE status = 'PENDING')::int` : Prisma.sql`0`} AS purchases,
    ${user.role === "SUPER_ADMIN" ? Prisma.sql`((SELECT count(*) FROM "WorkshopCorrectionRequest" WHERE status = 'PENDING') + (SELECT count(*) FROM "WorkshopOrder" WHERE "receivedNote" IS NOT NULL AND "receivedCheckedAt" IS NULL))::int` : Prisma.sql`0`} AS corrections`)
    .then(rows => rows[0]).catch(error => { console.error("[shell-data] admin badge counts failed", error); return { leads: 0, purchases: 0, corrections: 0 }; });
  const [{ leads, purchases, corrections }, sexBadge] = await Promise.all([counts, sexBadgeCount(user)]);
  return { newLeads: leads, pendingPurchases: purchases + corrections, linksBadge: referralLinksAreNew(), sexBadge };
}
