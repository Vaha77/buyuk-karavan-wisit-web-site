import "server-only";

import { randomBytes } from "node:crypto";
import { revalidateTag } from "next/cache";
import { getDb } from "@/lib/db";
import { REGION_BY_CODE } from "@/lib/dashboard/regions";
import { deviceFromUserAgent, HEARTBEAT_SECONDS, outcomeForEvent, upgradeOutcome, type EventKey, type OutcomeKey } from "./rules";
import { attributeLeadIn, findTrackedVisitIn, markVisitSaleIn, type AttributionDb, type TrackingCookies } from "./attribution";

export { isTrackingId, parseHandoff, type TrackingCookies } from "./attribution";

// Cookies are set by the client tracker only after the cookie notice has been shown (components/tracking).
export const VISITOR_COOKIE = "bk_vid"; // anonymous visitor id, 1 year
export const REF_COOKIE = "bk_ref"; // referral link id, 30 days, last click wins
export const VISIT_COOKIE = "bk_visit"; // current Visit id, 30 days
export const HANDOFF_PARAM = "_bk"; // "<visitId>~<visitorId>~<linkId>", passed from /r/[slug] to the tracker once
export const DASHBOARD_TAG = "dashboard";

export function newVisitorId() { return randomBytes(12).toString("base64url"); }

/** Country/region from Vercel geo headers; the raw IP is never read or stored. */
export function geoFromHeaders(headers: Headers) {
  const country = headers.get("x-vercel-ip-country")?.toUpperCase() || null;
  const region = headers.get("x-vercel-ip-country-region")?.toUpperCase() || null;
  const regionCode = country && region && REGION_BY_CODE.has(`${country}-${region}`) ? `${country}-${region}` : null;
  return { country: country && /^[A-Z]{2}$/.test(country) ? country : null, regionCode };
}

/** Dashboard aggregates are cached for 5 minutes; saving a lead, sale or monthly sale expires them. */
export function expireDashboard() { revalidateTag(DASHBOARD_TAG, { expire: 0 }); }

export async function createVisit(args: { linkId: string; visitorId: string; headers: Headers }) {
  const geo = geoFromHeaders(args.headers);
  return getDb().visit.create({ data: { referralLinkId: args.linkId, visitorId: args.visitorId, device: deviceFromUserAgent(args.headers.get("user-agent")), country: geo.country, regionCode: geo.regionCode }, select: { id: true } });
}

const attributionDb = () => getDb() as unknown as AttributionDb;
/** The visit named by the cookies, only if visitor and link match (cookies are client-writable) and it is ≤30 days old. */
export async function findTrackedVisit(cookies: TrackingCookies) { return findTrackedVisitIn(attributionDb(), cookies); }

/** Applies one tracker event: page count, time on site (heartbeats, capped by real elapsed time), outcome upgrade. */
export async function recordVisitEvent(cookies: TrackingCookies, event: { type: EventKey; path: string }) {
  const visit = await findTrackedVisit(cookies);
  if (!visit) return false;
  const now = new Date();
  const elapsed = Math.floor((now.getTime() - visit.lastSeenAt.getTime()) / 1000);
  const added = event.type === "HEARTBEAT" ? Math.max(0, Math.min(HEARTBEAT_SECONDS, elapsed + 2)) : 0;
  const durationSec = visit.durationSec + added;
  const outcome = upgradeOutcome(visit.outcome as OutcomeKey, outcomeForEvent(event.type, durationSec));
  await getDb().visit.update({ where: { id: visit.id }, data: { lastSeenAt: now, durationSec, outcome, ...(event.type === "PAGEVIEW" ? { pageCount: { increment: 1 } } : {}) } });
  // Heartbeats only move durationSec; storing each one as a row would add nothing to the reports.
  if (event.type !== "HEARTBEAT") await getDb().visitEvent.create({ data: { visitId: visit.id, type: event.type, path: event.path.slice(0, 300) } });
  return true;
}

/** Called after a lead is saved: copies the referral link to the lead and raises the visit to LEAD (see attribution.ts). */
export async function attributeLead(leadId: string, cookies: TrackingCookies, fallback?: TrackingCookies | null) { return attributeLeadIn(attributionDb(), leadId, cookies, fallback); }

/** Called when a lead's sale is confirmed. */
export async function markVisitSale(leadId: string) { return markVisitSaleIn(attributionDb(), leadId); }
