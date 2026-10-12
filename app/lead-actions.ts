"use server";

import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { cookies, headers } from "next/headers";
import { after } from "next/server";
import { getDb } from "@/lib/db";
import { getUsdUzsRate } from "@/lib/currency/cbu";
import { checkLandingInput } from "@/lib/leads/landing-rules";
import { createLead, findLeadSubmission } from "@/lib/leads/service";
import { sendLeadToMeta } from "@/lib/meta/capi";
import { isEventId } from "@/lib/meta/pixel-rules";
import { formatUzs, usdToSellingUzs } from "@/lib/pricing/money";
import { parseHandoff, REF_COOKIE, VISIT_COOKIE, VISITOR_COOKIE, type TrackingCookies } from "@/lib/referrals/tracking";
import { SITE_URL } from "@/lib/site-url";

/** Referral attribution cookies set by the public tracker (validated against the Visit row in createLead). */
async function trackingCookies(): Promise<TrackingCookies> {
  const jar = await cookies();
  return { visitId: jar.get(VISIT_COOKIE)?.value, visitorId: jar.get(VISITOR_COOKIE)?.value, linkId: jar.get(REF_COOKIE)?.value };
}

const attempts = new Map<string,{count:number;start:number;submissions:Set<string>}>();
const WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 5;

function inputField(input:unknown,key:"idempotencyKey"|"clientToken") {
  if (!input || typeof input !== "object" || !(key in input)) return "";
  const value = (input as Record<string,unknown>)[key];
  return typeof value === "string" ? value.trim().slice(0,100) : "";
}

function trustedClientIp(h:Awaited<ReturnType<typeof headers>>) {
  let candidate = "";
  if (process.env.VERCEL === "1") candidate = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  else if (process.env.CF_PAGES || process.env.CF_WORKER) candidate = h.get("cf-connecting-ip")?.trim() || "";
  else if (process.env.TRUST_PROXY === "1") candidate = h.get("x-real-ip")?.trim() || "";
  return isIP(candidate) ? candidate : "unknown";
}

/** Meta Conversions API "Lead" after the response, with the event id the browser Pixel used (deduplicated by Meta). */
async function reportMetaLead(input:unknown,phone:string,contentName:string|null){
  const eventId=input&&typeof input==="object"?(input as Record<string,unknown>).metaEventId:undefined;
  if(!isEventId(eventId))return;
  const h=await headers(),jar=await cookies();
  const ip=trustedClientIp(h),referer=h.get("referer");
  const eventSourceUrl=referer&&referer.startsWith(SITE_URL)?referer.split("#")[0]:SITE_URL;
  const data={eventId,phone,eventSourceUrl,userAgent:h.get("user-agent"),ip:ip==="unknown"?null:ip,fbp:jar.get("_fbp")?.value??null,fbc:jar.get("_fbc")?.value??null,contentName};
  after(()=>sendLeadToMeta(data).then(()=>undefined));
}

function limited(key:string,now:number,submissionKey:string) {
  const entry = attempts.get(key);
  if (!entry || now-entry.start>WINDOW_MS) { attempts.set(key,{count:1,start:now,submissions:new Set(submissionKey?[submissionKey]:[])}); return false; }
  if (submissionKey&&entry.submissions.has(submissionKey)) return false;
  if (entry.count>=MAX_ATTEMPTS) return true;
  entry.count += 1;
  if(submissionKey)entry.submissions.add(submissionKey);
  return false;
}

export async function submitLeadAction(input:unknown) {
  if (input && typeof input === "object" && (input as Record<string, unknown>).source === "HOME_CTA") {
    const candidate = input as Record<string, unknown>;
    const name = typeof candidate.customerName === "string" ? candidate.customerName.trim() : "";
    const phone = typeof candidate.phone === "string" ? candidate.phone.trim() : "";
    if (!name) return { ok: false as const, error: "Ismingizni kiriting." };
    if (!/^[+\d][\d\s().-]*$/.test(phone) || phone.replace(/\D/g, "").length < 9)
      return { ok: false as const, error: "Telefon raqamini tekshiring." };
  }
  const idempotencyKey = inputField(input,"idempotencyKey");
  if (idempotencyKey) {
    const existing = await findLeadSubmission(idempotencyKey);
    if (existing) return {ok:true as const,id:existing.id,duplicate:true as const};
  }

  if (process.env.NODE_ENV === "production") {
    const h = await headers();
    const clientToken = inputField(input,"clientToken");
    const fingerprint = [trustedClientIp(h),h.get("user-agent")||"unknown",clientToken||"anonymous"].join("|");
    const key = createHash("sha256").update(fingerprint).digest("hex");
    if (limited(key,Date.now(),idempotencyKey)) return {ok:false as const,error:"Juda ko‘p urinish. Birozdan keyin qayta urinib ko‘ring."};
  }

  if (input && typeof input === "object" && (input as Record<string,unknown>).source === "PRODUCT_CONSULTATION") {
    const candidate = input as Record<string,unknown>;
    const productId = typeof candidate.productId === "string" ? candidate.productId.trim() : "";
    const productSlug = typeof candidate.productSlug === "string" ? candidate.productSlug.trim() : "";
    const product = productId && productSlug ? await getDb().product.findFirst({
      where:{ id:productId, slug:productSlug, isVisible:true, category:{isActive:true} },
      select:{ id:true, slug:true, name:true, model:true },
    }) : null;
    if (!product) return {ok:false as const,error:"Mahsulot topilmadi. Sahifani yangilab, qayta urinib ko‘ring."};
    const consultation = await createLead({
      ...candidate,
      source:"PRODUCT_CONSULTATION",
      requestType:"Mahsulot bo‘yicha maslahat",
      product:[product.name,product.model].filter(Boolean).join(" "),
      productId:product.id,
      productSlug:product.slug,
    }, await trackingCookies());
    if (consultation.ok && !("duplicate" in consultation)) await reportMetaLead(input, typeof candidate.phone === "string" ? candidate.phone : "", [product.name,product.model].filter(Boolean).join(" "));
    return consultation;
  }

  const result = await createLead(input, await trackingCookies());
  if (result.ok && !("duplicate" in result)) await reportMetaLead(input, typeof (input as Record<string,unknown>).phone === "string" ? String((input as Record<string,unknown>).phone) : "", null);
  return result;
}

export type LandingResult = { ok: true; repeat: boolean; priceText: string | null; customerName: string } | { ok: false; field?: "customerName" | "regionCode" | "phone"; error: string };

/**
 * Lead page (/l/<product>): Ism + Viloyat + Telefon → BKLead lead (source PRODUCT, the product attached) with the
 * referral link from the cookies or the page's _bk hand-off. Answers with the live price (Prays × CBU) so the page can
 * show it in place of the form; the same phone within 24 h adds a note to the existing lead instead.
 */
export async function submitLandingLeadAction(input: { productSlug?: unknown; customerName?: unknown; regionCode?: unknown; phone?: unknown; handoff?: unknown; website?: unknown; idempotencyKey?: unknown; clientToken?: unknown; metaEventId?: unknown }): Promise<LandingResult> {
  const checked = checkLandingInput({ customerName: String(input.customerName ?? ""), regionCode: String(input.regionCode ?? ""), phone: String(input.phone ?? "") });
  if (!checked.ok) return { ok: false, field: checked.field, error: checked.error };
  if (typeof input.website === "string" && input.website.trim()) return { ok: false, error: "So‘rovni yuborib bo‘lmadi." };
  const idempotencyKey = inputField(input, "idempotencyKey");
  if (process.env.NODE_ENV === "production") {
    const h = await headers();
    const key = createHash("sha256").update([trustedClientIp(h), h.get("user-agent") || "unknown", inputField(input, "clientToken") || "anonymous"].join("|")).digest("hex");
    if (limited(key, Date.now(), idempotencyKey)) return { ok: false, error: "Juda ko‘p urinish. Birozdan keyin qayta urinib ko‘ring." };
  }
  const slug = typeof input.productSlug === "string" ? input.productSlug.trim().slice(0, 200) : "";
  const product = slug ? await getDb().product.findFirst({ where: { slug, isVisible: true, archivedAt: null, category: { isActive: true } }, select: { id: true, slug: true, name: true, model: true, priceUsd: true } }) : null;
  if (!product) return { ok: false, error: "Mahsulot topilmadi. Sahifani yangilab, qayta urinib ko‘ring." };
  const value = checked.value, productName = [product.name, product.model].filter(Boolean).join(" ");
  const result = await createLead({
    customerName: value.customerName, phone: value.phone, country: "UZ", regionCode: value.regionCode, region: value.region,
    source: "PRODUCT", requestType: "Narx so‘rovi (lid sahifasi)", product: productName, productId: product.id, productSlug: product.slug,
    ...(idempotencyKey.length >= 20 ? { idempotencyKey } : {}),
  }, await trackingCookies(), { handoff: parseHandoff(typeof input.handoff === "string" ? input.handoff : null) });
  if (!result.ok) return { ok: false, error: result.error };
  if (!("duplicate" in result)) await reportMetaLead(input, value.phone, productName);
  const rate = product.priceUsd ? await getUsdUzsRate().catch(() => null) : null;
  const uzs = product.priceUsd && rate ? usdToSellingUzs(product.priceUsd.toString(), rate.rate) : null;
  return { ok: true, repeat: "repeat" in result, priceText: uzs === null ? null : formatUzs(uzs), customerName: value.customerName };
}
