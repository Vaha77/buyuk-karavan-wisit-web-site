// Lead page (/l/<product>) form and duplicate protection: pure rules + small repository functions that take the
// database as an argument (no server-only imports), covered by tests/lead-landing.test.mjs.
import { regionsOf } from "../dashboard/regions";

/** O‘zbekiston: Toshkent shahri, 12 viloyat va Qoraqalpog‘iston — 14 hudud. */
export const UZ_REGIONS = regionsOf("UZ").map(region => ({ code: region.code, name: region.name }));

/** Any typing → the 9 local digits after +998 ("+998 90 123-45-67", "901234567", "998901234567" → "901234567"). */
export function localDigits(value: string) {
  const digits = value.replace(/\D/g, "");
  return (digits.length > 9 && digits.startsWith("998") ? digits.slice(3) : digits).slice(0, 9);
}
/** "901234567" → "90 123 45 67" (what the masked input shows after the fixed "+998"). */
export function formatLocalPhone(digits: string) {
  const d = localDigits(digits);
  return [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean).join(" ");
}
/** Uzbek mobile / city number: 9 digits after +998, starting with a known operator or city code. */
export const isUzPhone = (digits: string) => /^(?:33|50|55|61|62|65|66|67|69|70|71|72|73|74|75|76|77|78|79|88|90|91|93|94|95|97|98|99)\d{7}$/.test(digits);

export type LandingInput = { customerName: string; regionCode: string; phone: string };
export type LandingCheck = { ok: true; value: { customerName: string; regionCode: string; region: string; phone: string } } | { ok: false; field: "customerName" | "regionCode" | "phone"; error: string };

/** The three fields of the lead page form → normalized values ("+998901234567") or the first error. */
export function checkLandingInput(input: Partial<LandingInput>): LandingCheck {
  const customerName = String(input.customerName ?? "").trim().replace(/\s+/g, " ");
  if (customerName.length < 2 || customerName.length > 80) return { ok: false, field: "customerName", error: "Ismingizni kiriting." };
  const region = UZ_REGIONS.find(item => item.code === input.regionCode);
  if (!region) return { ok: false, field: "regionCode", error: "Viloyatingizni tanlang." };
  const digits = localDigits(String(input.phone ?? ""));
  if (!isUzPhone(digits)) return { ok: false, field: "phone", error: "Telefon raqamini to‘liq kiriting: +998 90 123 45 67." };
  return { ok: true, value: { customerName, regionCode: region.code, region: region.name, phone: `+998${digits}` } };
}

// ---- Duplicate protection: the same phone within 24 hours → no new lead, a note on the existing one -----------

export const DUPLICATE_WINDOW_MS = 24 * 3_600_000;

export type DedupeDb = {
  lead: { findFirst(args: { where: Record<string, unknown>; orderBy: Record<string, "asc" | "desc">; select: Record<string, true> }): Promise<{ id: string; referralLinkId: string | null } | null> };
  leadActivity: { create(args: { data: { leadId: string; type: "COMMENT_ADDED"; comment: string } }): Promise<unknown> };
};

/** The newest lead with this (normalized) phone created within the last 24 hours. */
export function findRecentLeadByPhone(db: DedupeDb, phone: string, now = new Date()) {
  if (!phone) return Promise.resolve(null);
  return db.lead.findFirst({ where: { phone, createdAt: { gte: new Date(now.getTime() - DUPLICATE_WINDOW_MS) } }, orderBy: { createdAt: "desc" }, select: { id: true, referralLinkId: true } });
}

/** "Qayta murojaat (12.10 14:32): Mahsulot … · Namangan viloyati · Ism: Ali" — the note left on the existing lead. */
export function repeatRequestNote(input: { customerName?: string | null; product?: string | null; region?: string | null; requestType?: string | null; notes?: string | null; source?: string | null }, now = new Date()) {
  const local = new Date(now.getTime() + 5 * 3_600_000).toISOString(); // Tashkent, UTC+5
  const when = `${local.slice(8, 10)}.${local.slice(5, 7)} ${local.slice(11, 16)}`;
  const parts = [input.requestType, input.product && `Mahsulot: ${input.product}`, input.region, input.customerName && `Ism: ${input.customerName}`, input.source && `Manba: ${input.source}`, input.notes].filter(Boolean);
  return `Qayta murojaat (${when}): ${parts.join(" · ")}`.slice(0, 1000);
}

export async function addRepeatRequest(db: DedupeDb, leadId: string, note: string) {
  await db.leadActivity.create({ data: { leadId, type: "COMMENT_ADDED", comment: note } });
}
