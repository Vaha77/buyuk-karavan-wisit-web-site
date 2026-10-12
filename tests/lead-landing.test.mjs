import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { register } from "node:module";

register("./ts-resolve.mjs", import.meta.url);
const rules = await import("../lib/referrals/rules.ts");
const attribution = await import("../lib/referrals/attribution.ts");
const landing = await import("../lib/leads/landing-rules.ts");
const meta = await import("../lib/meta/capi-rules.ts");
const read = path => readFile(new URL(path, import.meta.url), "utf8");

// ---- In-memory stand-in for the Prisma delegates used by attribution.ts and landing-rules.ts ----------------------
function memoryDb() {
  const state = { visits: [], leads: [], events: [], activities: [] };
  const pick = (row, select) => row && Object.fromEntries(Object.keys(select).map(key => [key, key === "lead" ? (state.leads.find(lead => lead.visitId === row.id) ? { id: state.leads.find(lead => lead.visitId === row.id).id } : null) : row[key]]));
  const db = {
    state,
    visit: {
      async findUnique({ where, select }) { return pick(state.visits.find(row => row.id === where.id) ?? null, select); },
      async update({ where, data }) { const row = state.visits.find(item => item.id === where.id); Object.assign(row, data); return row; },
    },
    visitEvent: { async create({ data }) { state.events.push(data); return data; } },
    lead: {
      async findUnique({ where, select }) { return pick(state.leads.find(row => row.id === where.id) ?? null, select); },
      async update({ where, data }) { const row = state.leads.find(item => item.id === where.id); Object.assign(row, data); return row; },
      async findFirst({ where }) {
        const rows = state.leads.filter(row => row.phone === where.phone && row.createdAt >= where.createdAt.gte).sort((a, b) => b.createdAt - a.createdAt);
        return rows[0] ? { id: rows[0].id, referralLinkId: rows[0].referralLinkId } : null;
      },
    },
    leadActivity: { async create({ data }) { state.activities.push(data); return data; } },
  };
  return db;
}
const LINK = "link_instagram_ads1", VISITOR = "visitor_abc12345", VISIT = "visit_0001abcd";
/** The /r/<slug> click: what app/r/[slug]/route.ts stores before redirecting. */
const click = (db, at = new Date("2026-10-12T08:00:00Z"), id = VISIT, visitor = VISITOR) => db.state.visits.push({ id, visitorId: visitor, referralLinkId: LINK, outcome: "LEFT", firstSeenAt: at, lastSeenAt: at, durationSec: 0 });
/** The link's row in Referal linklar: outcomes of its visits → klik / zayavka / sotuv (lib/referrals/queries.ts). */
function linkStats(db) {
  const counts = Object.fromEntries(rules.OUTCOME_ORDER.map(key => [key, 0]));
  for (const visit of db.state.visits.filter(row => row.referralLinkId === LINK)) counts[visit.outcome]++;
  return rules.linkFunnel(counts);
}

test("link mode 'Lid sahifasi (forma tepada)': /l/<product>, price after the form by default", () => {
  assert.equal(rules.leadPagePath("br-20pg"), "/l/br-20pg");
  assert.equal(rules.leadPagePath("br-20pg", "before"), "/l/br-20pg?narx=oldin");
  assert.deepEqual(rules.parseLeadPagePath("/l/br-20pg"), { productSlug: "br-20pg", timing: "after" });
  assert.deepEqual(rules.parseLeadPagePath("/l/br-20pg?narx=oldin"), { productSlug: "br-20pg", timing: "before" });
  assert.equal(rules.parseLeadPagePath("/products/br-20pg"), null);
  assert.equal(rules.parseLeadPagePath("/l/../admin"), null);
  assert.equal(rules.safeTargetPath("/l/br-20pg?narx=oldin"), "/l/br-20pg?narx=oldin", "allowed as a link target");
  assert.equal(rules.withUtm("/l/br-20pg?narx=oldin", "ig-reels"), "/l/br-20pg?narx=oldin&utm_source=ig-reels&utm_medium=referral&utm_campaign=ig-reels", "the price setting survives the /r/ redirect");
  assert.equal(rules.priceTimingOf("oldin"), "before");
  assert.equal(rules.priceTimingOf(undefined), "after");
});

test("form: Ism, 14 viloyat, +998 telefon (mask and validation)", () => {
  assert.equal(landing.UZ_REGIONS.length, 14);
  assert.ok(landing.UZ_REGIONS.some(region => region.code === "UZ-NG" && region.name === "Namangan viloyati"));
  assert.ok(landing.UZ_REGIONS.some(region => region.code === "UZ-QR"));
  assert.equal(landing.localDigits("+998 90 123-45-67"), "901234567");
  assert.equal(landing.localDigits("998901234567"), "901234567");
  assert.equal(landing.localDigits("90 123 45 67 89"), "901234567", "never more than 9 digits");
  assert.equal(landing.formatLocalPhone("901234567"), "90 123 45 67");
  assert.equal(landing.formatLocalPhone("9012"), "90 12");
  assert.deepEqual(landing.checkLandingInput({ customerName: "  Ali   Valiyev ", regionCode: "UZ-NG", phone: "90 123 45 67" }), { ok: true, value: { customerName: "Ali Valiyev", regionCode: "UZ-NG", region: "Namangan viloyati", phone: "+998901234567" } });
  assert.equal(landing.checkLandingInput({ customerName: "A", regionCode: "UZ-NG", phone: "901234567" }).field, "customerName");
  assert.equal(landing.checkLandingInput({ customerName: "Ali", regionCode: "KZ-AST", phone: "901234567" }).field, "regionCode", "only Uzbekistan's regions");
  assert.equal(landing.checkLandingInput({ customerName: "Ali", regionCode: "UZ-NG", phone: "90123" }).field, "phone");
  assert.equal(landing.checkLandingInput({ customerName: "Ali", regionCode: "UZ-NG", phone: "121234567" }).field, "phone", "unknown operator code");
});

test("attribution: /r/ click → zayavka later from another page (cookie) → sotuv, counted on the link", async () => {
  const db = memoryDb();
  click(db);
  assert.deepEqual(linkStats(db), { clicks: 1, leads: 0, sales: 0 });
  // Two days later the visitor sends the form from the home page; the tracker's cookies still name the visit.
  db.state.leads.push({ id: "lead_1", phone: "+998901234567", createdAt: new Date("2026-10-14T10:00:00Z"), referralLinkId: null, visitId: null });
  const linked = await attribution.attributeLeadIn(db, "lead_1", { visitId: VISIT, visitorId: VISITOR, linkId: LINK }, null, new Date("2026-10-14T10:00:00Z"));
  assert.equal(linked, LINK);
  assert.equal(db.state.leads[0].referralLinkId, LINK, "lead carries the link (Telegram 'Manba', CRM)");
  assert.equal(db.state.leads[0].visitId, VISIT);
  assert.deepEqual(db.state.events, [{ visitId: VISIT, type: "FORM_SUBMIT", path: "lead" }]);
  assert.deepEqual(linkStats(db), { clicks: 1, leads: 1, sales: 0 }, "+1 zayavka");
  await attribution.markVisitSaleIn(db, "lead_1");
  assert.deepEqual(linkStats(db), { clicks: 1, leads: 1, sales: 1 }, "the sale is still one zayavka, plus one sotuv");
});

test("attribution: the lead page's _bk hand-off when cookies are missing; forged / expired visits are ignored", async () => {
  const db = memoryDb();
  click(db);
  db.state.leads.push({ id: "lead_2", referralLinkId: null, visitId: null });
  const handoff = attribution.parseHandoff(`${VISIT}~${VISITOR}~${LINK}`);
  assert.deepEqual(handoff, { visitId: VISIT, visitorId: VISITOR, linkId: LINK });
  assert.equal(attribution.parseHandoff("a~b"), null);
  assert.equal(attribution.parseHandoff(`${VISIT}~${VISITOR}~${LINK}~x`), null);
  assert.equal(await attribution.attributeLeadIn(db, "lead_2", {}, handoff, new Date("2026-10-12T08:05:00Z")), LINK);
  assert.equal(linkStats(db).leads, 1);

  const other = memoryDb();
  click(other);
  other.state.leads.push({ id: "lead_3", referralLinkId: null, visitId: null });
  assert.equal(await attribution.attributeLeadIn(other, "lead_3", { visitId: VISIT, visitorId: "visitor_forged01", linkId: LINK }), null, "cookie of another visitor");
  assert.equal(await attribution.attributeLeadIn(other, "lead_3", { visitId: VISIT, visitorId: VISITOR, linkId: LINK }, null, new Date("2026-11-20T08:00:00Z")), null, "older than 30 days");
  assert.equal(linkStats(other).leads, 0);
});

test("attribution: a second form from the same visit keeps the link but not the visit (Lead.visitId is unique)", async () => {
  const db = memoryDb();
  click(db);
  db.state.leads.push({ id: "lead_a", referralLinkId: null, visitId: null }, { id: "lead_b", referralLinkId: null, visitId: null });
  const cookies = { visitId: VISIT, visitorId: VISITOR, linkId: LINK };
  await attribution.attributeLeadIn(db, "lead_a", cookies, null, new Date("2026-10-12T09:00:00Z"));
  await attribution.attributeLeadIn(db, "lead_b", cookies, null, new Date("2026-10-12T09:10:00Z"));
  assert.equal(db.state.leads[1].referralLinkId, LINK);
  assert.equal(db.state.leads[1].visitId, null);
  assert.deepEqual(linkStats(db), { clicks: 1, leads: 1, sales: 0 }, "one visitor, one zayavka");
});

test("duplicates: the same phone within 24 h → no new lead, a note on the existing one", async () => {
  const db = memoryDb(), now = new Date("2026-10-12T12:00:00Z");
  db.state.leads.push({ id: "old", phone: "+998901234567", createdAt: new Date("2026-10-10T12:00:00Z"), referralLinkId: null }, { id: "recent", phone: "+998901234567", createdAt: new Date("2026-10-12T02:00:00Z"), referralLinkId: LINK });
  assert.deepEqual(await landing.findRecentLeadByPhone(db, "+998901234567", now), { id: "recent", referralLinkId: LINK });
  assert.equal(await landing.findRecentLeadByPhone(db, "+998901234567", new Date("2026-10-13T03:00:00Z")), null, "after 24 hours a new lead is allowed");
  assert.equal(await landing.findRecentLeadByPhone(db, "+998935554433", now), null);
  assert.equal(await landing.findRecentLeadByPhone(db, "", now), null);
  const note = landing.repeatRequestNote({ customerName: "Ali", product: "BR +20PG", region: "Namangan viloyati", requestType: "Narx so‘rovi (lid sahifasi)" }, now);
  assert.match(note, /^Qayta murojaat \(12\.10 17:00\): Narx so‘rovi \(lid sahifasi\) · Mahsulot: BR \+20PG · Namangan viloyati · Ism: Ali$/);
  await landing.addRepeatRequest(db, "recent", note);
  assert.deepEqual(db.state.activities, [{ leadId: "recent", type: "COMMENT_ADDED", comment: note }]);
  const service = await read("../lib/leads/service.ts");
  assert.ok(service.indexOf("findRecentLeadByPhone") < service.indexOf("getDb().lead.create"), "checked before a lead is created");
});

test("Meta: phone only as SHA-256, the same event_id for Pixel and Conversions API, nothing without env", () => {
  const expected = createHash("sha256").update("998901234567").digest("hex");
  assert.equal(meta.hashPhone("+998 90 123-45-67"), expected);
  assert.equal(meta.hashPhone("901234567"), expected, "local number gets 998");
  assert.equal(meta.hashPhone(""), null);
  const event = meta.buildLeadEvent({ eventId: "abc123def456", phone: "+998901234567", eventSourceUrl: "https://buyukkaravan.com/l/br-20pg", userAgent: "Mozilla/5.0", ip: "203.0.113.5", fbp: "fb.1.1.1", fbc: null, contentName: "BR +20PG", now: new Date("2026-10-12T12:00:00Z") });
  assert.equal(event.event_name, "Lead");
  assert.equal(event.event_id, "abc123def456");
  assert.equal(event.event_time, 1791806400);
  assert.equal(event.action_source, "website");
  assert.deepEqual(event.user_data.ph, [expected]);
  assert.doesNotMatch(JSON.stringify(event), /901234567/, "no plain phone in the payload");
  assert.deepEqual(meta.metaConfig({}), { pixelId: null, token: null });
  assert.deepEqual(meta.metaConfig({ NEXT_PUBLIC_META_PIXEL_ID: " 123456789012345 ", META_CAPI_ACCESS_TOKEN: "x" }), { pixelId: "123456789012345", token: "x" });
  assert.equal(meta.metaConfig({ NEXT_PUBLIC_META_PIXEL_ID: "<script>" }).pixelId, null);
  assert.equal(meta.pixelAllowed("/"), true);
  assert.equal(meta.pixelAllowed("/l/br-20pg"), true);
  assert.equal(meta.pixelAllowed("/admin"), false);
  assert.equal(meta.pixelAllowed("/admin/leads"), false);
  assert.equal(meta.isEventId("abc123def456"), true);
  assert.equal(meta.isEventId("x"), false);
});

test("wiring: lead page stays in place after sending, Pixel only on public pages, CAPI with the same event id", async () => {
  const form = await read("../components/landing/landing-form.tsx");
  assert.match(form, /submitLandingLeadAction/);
  assert.doesNotMatch(form, /router\.push|redirect\(|location\.(href|assign|replace)/, "no redirect after sending");
  assert.match(form, /Rahmat, \{done\.name\}! Mutaxassisimiz tez orada qo‘ng‘iroq qiladi/);
  assert.match(form, /Narxini bilish/);
  assert.match(form, /madina:open/);
  assert.match(form, /trackMeta\("Lead", \{ content_name: productName \}, eventId\.current\)/);
  assert.match(form, /metaEventId: eventId\.current/);
  const action = await read("../app/lead-actions.ts");
  assert.match(action, /export async function submitLandingLeadAction/);
  assert.match(action, /parseHandoff/);
  assert.match(action, /usdToSellingUzs/, "live price from Prays × CBU");
  assert.match(action, /after\(\(\) ?=> ?sendLeadToMeta/);
  const capi = await read("../lib/meta/capi.ts");
  assert.doesNotMatch(capi, /console\.\w+\([^\n]*token/i, "the token is never logged");
  assert.doesNotMatch(capi, /access_token=/, "token not in a URL");
  const pixel = await read("../components/tracking/meta-pixel.tsx");
  assert.match(pixel, /if \(!PIXEL_ID \|\| !pixelAllowed\(pathname\)\) return;/, "nothing loads without the id or on /admin");
  assert.doesNotMatch(pixel, /capi-rules/, "no Node crypto in the browser bundle");
  const layout = await read("../app/layout.tsx");
  assert.match(layout, /<MetaPixel\/>/);
  const productPage = await read("../app/products/[slug]/page.tsx");
  assert.match(productPage, /<MetaViewContent/);
  const page = await read("../app/l/[slug]/page.tsx");
  assert.match(page, /priceTimingOf\(query\.narx\)/);
  assert.match(page, /index: false/, "ad landing not indexed");
  const telegram = await read("../lib/telegram/messages.ts");
  assert.match(telegram, /📣 Manba: \$\{lead\.referralName/);
  const telegramService = await read("../lib/telegram/service.ts");
  assert.match(telegramService, /referralLink:\{select:\{name:true,ownerAgent:true\}\}/, "link name and owner in the Telegram message");
  const privacy = await read("../app/privacy/page.tsx");
  assert.match(privacy, /Meta Pixel va Conversions API/);
  assert.match(privacy, /Meta Pixel и Conversions API/);
  const css = await read("../components/landing/lead-landing.css");
  assert.match(css, /\.landing-product\{display:grid;grid-template-columns:96px/, "compact product row on phones");
});
