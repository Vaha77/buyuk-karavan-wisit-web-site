// Referral attribution core: which link a lead (and later its sale) belongs to. No server-only imports — the database
// is passed in, so tests/referral-attribution.test.mjs runs it against an in-memory stand-in.
import { upgradeOutcome, type OutcomeKey } from "./rules";

export const VISIT_TTL_MS = 30 * 86_400_000;
const ID = /^[A-Za-z0-9_-]{8,40}$/;
export function isTrackingId(value: string | null | undefined): value is string { return !!value && ID.test(value); }

export type TrackingCookies = { visitId?: string; visitorId?: string; linkId?: string };

/** "<visitId>~<visitorId>~<linkId>" from /r/<slug> (the _bk parameter) → the same shape as the cookies. */
export function parseHandoff(value: string | null | undefined): TrackingCookies | null {
  const [visitId, visitorId, linkId, extra] = (value ?? "").split("~");
  return extra === undefined && [visitId, visitorId, linkId].every(isTrackingId) ? { visitId, visitorId, linkId } : null;
}

type VisitRow = { id: string; visitorId: string; referralLinkId: string | null; outcome: string; firstSeenAt: Date; lastSeenAt: Date; durationSec: number; lead: { id: string } | null };
/** The Prisma delegates used here (structural, so a test double fits). */
export type AttributionDb = {
  visit: {
    findUnique(args: { where: { id: string }; select: Record<string, unknown> }): Promise<VisitRow | null>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  };
  visitEvent: { create(args: { data: { visitId: string; type: string; path: string } }): Promise<unknown> };
  lead: {
    findUnique(args: { where: { id: string }; select: Record<string, unknown> }): Promise<{ visitId: string | null } | null>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  };
};

const VISIT_SELECT = { id: true, visitorId: true, referralLinkId: true, outcome: true, firstSeenAt: true, lastSeenAt: true, durationSec: true, lead: { select: { id: true } } };

/** The visit named by the cookies, only if visitor and link match (cookies are client-writable) and it is ≤30 days old. */
export async function findTrackedVisitIn(db: AttributionDb, cookies: TrackingCookies, now = new Date()) {
  if (!isTrackingId(cookies.visitId) || !isTrackingId(cookies.visitorId) || !isTrackingId(cookies.linkId)) return null;
  const visit = await db.visit.findUnique({ where: { id: cookies.visitId }, select: VISIT_SELECT });
  if (!visit || visit.visitorId !== cookies.visitorId || visit.referralLinkId !== cookies.linkId) return null;
  if (now.getTime() - visit.firstSeenAt.getTime() > VISIT_TTL_MS) return null;
  return visit;
}

/**
 * After a lead is saved: copies the referral link to the lead and raises the visit to LEAD, so the link's statistics
 * count klik → zayavka, even when the form is sent later from another page (the cookies live 30 days). `fallback` is
 * the _bk hand-off the lead page carried, used when the cookies are missing. Returns the link id or null.
 */
export async function attributeLeadIn(db: AttributionDb, leadId: string, cookies: TrackingCookies, fallback?: TrackingCookies | null, now = new Date()) {
  const visit = await findTrackedVisitIn(db, cookies, now) ?? (fallback ? await findTrackedVisitIn(db, fallback, now) : null);
  if (!visit?.referralLinkId) return null;
  // Lead.visitId is unique: a second form from the same visit keeps only the link.
  await db.lead.update({ where: { id: leadId }, data: { referralLinkId: visit.referralLinkId, ...(visit.lead ? {} : { visitId: visit.id }) } });
  await db.visit.update({ where: { id: visit.id }, data: { outcome: upgradeOutcome(visit.outcome as OutcomeKey, "LEAD"), lastSeenAt: now } });
  await db.visitEvent.create({ data: { visitId: visit.id, type: "FORM_SUBMIT", path: "lead" } });
  return visit.referralLinkId;
}

/** When a lead's sale is confirmed: its visit becomes SALE (counted in the link's "sotuv"). */
export async function markVisitSaleIn(db: AttributionDb, leadId: string) {
  const lead = await db.lead.findUnique({ where: { id: leadId }, select: { visitId: true } });
  if (lead?.visitId) await db.visit.update({ where: { id: lead.visitId }, data: { outcome: "SALE" } });
}
