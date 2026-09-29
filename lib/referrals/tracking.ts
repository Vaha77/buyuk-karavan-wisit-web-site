import "server-only";

import { randomBytes } from "node:crypto";
import { revalidateTag } from "next/cache";
import { getDb } from "@/lib/db";
import { REGION_BY_CODE } from "@/lib/dashboard/regions";
import { deviceFromUserAgent, HEARTBEAT_SECONDS, outcomeForEvent, upgradeOutcome, type EventKey, type OutcomeKey } from "./rules";

// Cookies are set by the client tracker only after the cookie notice has been shown (components/tracking).
export const VISITOR_COOKIE = "bk_vid"; // anonymous visitor id, 1 year
export const REF_COOKIE = "bk_ref"; // referral link id, 30 days, last click wins
export const VISIT_COOKIE = "bk_visit"; // current Visit id, 30 days
export const HANDOFF_PARAM = "_bk"; // "<visitId>~<visitorId>~<linkId>", passed from /r/[slug] to the tracker once
export const DASHBOARD_TAG = "dashboard";
const VISIT_TTL_MS = 30 * 86_400_000;

export function newVisitorId() { return randomBytes(12).toString("base64url"); }
const ID = /^[A-Za-z0-9_-]{8,40}$/;
export function isTrackingId(value: string | null | undefined): value is string { return !!value && ID.test(value); }

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

export type TrackingCookies = { visitId?: string; visitorId?: string; linkId?: string };
/** The visit named by the cookies, only if visitor and link match (cookies are client-writable) and it is ≤30 days old. */
export async function findTrackedVisit(cookies: TrackingCookies) {
  if (!isTrackingId(cookies.visitId) || !isTrackingId(cookies.visitorId) || !isTrackingId(cookies.linkId)) return null;
  const visit = await getDb().visit.findUnique({ where: { id: cookies.visitId }, select: { id: true, visitorId: true, referralLinkId: true, outcome: true, firstSeenAt: true, lastSeenAt: true, durationSec: true, lead: { select: { id: true } } } });
  if (!visit || visit.visitorId !== cookies.visitorId || visit.referralLinkId !== cookies.linkId) return null;
  if (Date.now() - visit.firstSeenAt.getTime() > VISIT_TTL_MS) return null;
  return visit;
}

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

/** Called after a lead is saved: copies the referral link to the lead and raises the visit to LEAD. */
export async function attributeLead(leadId: string, cookies: TrackingCookies) {
  const visit = await findTrackedVisit(cookies);
  if (!visit?.referralLinkId) return;
  // Lead.visitId is unique: a second form from the same visit keeps only the link.
  await getDb().lead.update({ where: { id: leadId }, data: { referralLinkId: visit.referralLinkId, ...(visit.lead ? {} : { visitId: visit.id }) } });
  await getDb().visit.update({ where: { id: visit.id }, data: { outcome: upgradeOutcome(visit.outcome as OutcomeKey, "LEAD"), lastSeenAt: new Date() } });
  await getDb().visitEvent.create({ data: { visitId: visit.id, type: "FORM_SUBMIT", path: "lead" } });
}

/** Called when a lead's sale is confirmed. */
export async function markVisitSale(leadId: string) {
  const lead = await getDb().lead.findUnique({ where: { id: leadId }, select: { visitId: true } });
  if (lead?.visitId) await getDb().visit.update({ where: { id: lead.visitId }, data: { outcome: "SALE" } });
}
