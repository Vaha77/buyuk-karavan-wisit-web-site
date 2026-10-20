import "server-only";
import type { AdminUser } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { myDueCustomers } from "@/lib/customers/seller-queries";
import { referralLinksAreNew } from "@/lib/referrals/rules";
import { sexBadgeCount } from "@/lib/sex/queries";

/** Badge counts for the sidebar of whichever role is signed in (each role only queries what its menu shows). */
export async function getShellData(user: AdminUser) {
  const db = getDb();
  if (user.role === "SELLER") {
    const due = user.salesPersonId ? (await myDueCustomers(user).catch(() => [])).length : 0;
    return { dueToday: due };
  }
  if (user.role === "WORKSHOP" || user.role === "STOREKEEPER") return { sexBadge: await sexBadgeCount(user) };
  const canReview = user.role === "SUPER_ADMIN" || user.role === "ADMIN";
  const [newLeads, pendingPurchases, corrections, sexBadge] = await Promise.all([
    db.lead.count({ where: { status: "NEW" } }).catch(() => 0),
    canReview ? db.customerPurchase.count({ where: { status: "PENDING" } }).catch(() => 0) : 0,
    user.role === "SUPER_ADMIN" ? Promise.all([db.workshopCorrectionRequest.count({ where: { status: "PENDING" } }), db.workshopOrder.count({ where: { receivedNote: { not: null }, receivedCheckedAt: null } })]).then(([a, b]) => a + b).catch(() => 0) : 0,
    sexBadgeCount(user),
  ]);
  return { newLeads, pendingPurchases: pendingPurchases + corrections, linksBadge: referralLinksAreNew(), sexBadge };
}
