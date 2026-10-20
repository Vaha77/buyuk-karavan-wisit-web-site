import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";

register("./ts-resolve.mjs", import.meta.url);
const d = await import("../lib/instagram/direct-rules.ts");
const sign = await import("../lib/instagram/direct-sign.ts");
const rules = await import("../lib/instagram/rules.ts");
const read = path => readFile(new URL(path, import.meta.url), "utf8");

// Tashkent = UTC+5: 10:00 Tashkent = 05:00Z.
const T = (hhmm, day = "2026-10-12") => new Date(`${day}T${hhmm}:00+05:00`);
const START = 9 * 60, END = 20 * 60;

test("echo → Javob berildi with the response time; automatic echoes and other states do not answer", () => {
  const waiting = { status: "UNREAD", waitingSince: T("14:32"), cycleCount: 2, messageCount: 2 };
  const answered = d.onEcho(waiting, T("14:47"), false);
  assert.equal(answered.answered, true);
  assert.equal(answered.responseMs, 15 * 60_000);
  assert.equal(answered.data.status, "ANSWERED");
  assert.equal(answered.data.waitingSince, null);
  assert.equal(d.onEcho({ ...waiting, status: "OPENED" }, T("15:00"), false).data.status, "ANSWERED", "Ochildi → Javob berildi");
  assert.equal(d.onEcho(waiting, T("14:33"), true), null, "our price DM / auto message is not an answer");
  assert.equal(d.onEcho(null, T("14:33"), false), null, "we wrote first: no conversation");
  assert.deepEqual(d.onEcho({ ...waiting, status: "ANSWERED" }, T("15:00"), false), { answered: false, responseMs: null, data: { lastOutgoingAt: T("15:00") } });
  const card = d.cardText({ username: "ali", name: "Ali", status: "ANSWERED", cycleCount: 1, waitingSince: null, openedByName: null, openedAt: null, answeredAt: T("14:47"), lastResponseMs: 15 * 60_000, dismissReason: null, dismissedBy: null, recent: [{ text: "Salom", kind: "TEXT", sentAt: T("14:32") }] });
  assert.match(card, /✅ Javob berildi · 14:47 \(15 daq\)/);
});

test("automatic echo detection: same id, or the same text from us within 15 minutes", () => {
  const marks = { mids: new Set(["mid-auto"]), texts: [{ text: "Assalomu alaykum! Narxi — 12 000 000 so'm", at: T("10:00") }] };
  assert.equal(d.isAutoEcho({ mid: "mid-auto", text: "x", time: T("10:00") }, marks), true);
  assert.equal(d.isAutoEcho({ mid: "m2", text: "Assalomu alaykum! Narxi — 12 000 000 so'm ", time: T("10:05") }, marks), true);
  assert.equal(d.isAutoEcho({ mid: "m3", text: "Assalomu alaykum! Narxi — 12 000 000 so'm", time: T("10:30") }, marks), false, "too late");
  assert.equal(d.isAutoEcho({ mid: "m4", text: "Salom, yordam beraman", time: T("10:01") }, marks), false, "a person's answer");
});

test("repeat messages merge into one card per cycle; a new cycle starts after Javob berildi / Kerak emas", () => {
  const first = d.onIncoming(null, T("14:32"), true);
  assert.equal(first.newCycle, true);
  assert.equal(first.data.status, "UNREAD");
  assert.equal(first.data.deferred, false);
  const state = { status: "UNREAD", waitingSince: T("14:32"), cycleCount: 1, messageCount: 1 };
  const second = d.onIncoming(state, T("14:33"), true);
  assert.equal(second.newCycle, false, "same card, edited");
  assert.deepEqual(second.data, { cycleCount: 2, messageCount: 2, lastIncomingAt: T("14:33") });
  assert.equal(d.onIncoming({ ...state, status: "OPENED" }, T("14:40"), true).newCycle, false);
  for (const status of ["ANSWERED", "DISMISSED"]) {
    const again = d.onIncoming({ ...state, status, waitingSince: null, messageCount: 5 }, T("16:00"), true);
    assert.equal(again.newCycle, true, status);
    assert.equal(again.data.status, "UNREAD", "Qaralmagan again");
    assert.equal(again.data.messageCount, 6);
    assert.equal(again.data.cycleCount, 1);
    assert.deepEqual(again.data.telegramCards, [], "a new card");
    assert.equal(again.data.reminded30At, null);
  }
  assert.equal(d.onIncoming(null, T("22:10"), false).data.deferred, true, "outside working hours → morning digest");
  const recent = [1, 2, 3, 4, 5].map(n => ({ text: `xabar ${n}`, kind: "TEXT", sentAt: T(`14:3${n}`) }));
  const card = d.cardText({ username: "ali", name: "Ali Valiyev", status: "UNREAD", cycleCount: 5, waitingSince: T("14:31"), openedByName: null, openedAt: null, answeredAt: null, lastResponseMs: null, dismissReason: null, dismissedBy: null, recent: recent.slice(-3) }, T("14:50"));
  assert.match(card, /^📩 Instagram: @ali \(Ali Valiyev\)/);
  assert.match(card, /• “xabar 3” — 14:33\n• “xabar 4” — 14:34\n• “xabar 5” — 14:35\nJami: 5 ta xabar/);
  assert.doesNotMatch(card, /xabar 2/);
  assert.match(card, /⏳ Qaralmagan · 19 daq/);
  const one = d.cardText({ username: "ali", name: null, status: "UNREAD", cycleCount: 1, waitingSince: T("14:32"), openedByName: null, openedAt: null, answeredAt: null, lastResponseMs: null, dismissReason: null, dismissedBy: null, recent: [{ text: null, kind: "AUDIO", sentAt: T("14:32") }] }, T("14:32"));
  assert.match(one, /^📩 Instagram: @ali — 🎤 Ovozli xabar — 14:32/);
  assert.match(d.cardText({ username: null, name: "Vali", status: "OPENED", cycleCount: 1, waitingSince: T("14:32"), openedByName: "Ikrom", openedAt: T("14:35"), answeredAt: null, lastResponseMs: null, dismissReason: null, dismissedBy: null, recent: [] }), /👀 Ochildi: Ikrom · 14:35/);
  assert.match(d.cardText({ username: "x", name: null, status: "DISMISSED", cycleCount: 1, waitingSince: null, openedByName: null, openedAt: null, answeredAt: null, lastResponseMs: null, dismissReason: "Spam", dismissedBy: "Ikrom", recent: [] }), /🚫 Kerak emas: Spam — Ikrom/);
});

test("working hours (Tashkent) and working-time waiting", () => {
  assert.equal(d.isWorkTime(T("08:59"), START, END), false);
  assert.equal(d.isWorkTime(T("09:00"), START, END), true);
  assert.equal(d.isWorkTime(T("19:59"), START, END), true);
  assert.equal(d.isWorkTime(T("20:00"), START, END), false);
  assert.equal(d.tashkentDate(T("23:30")), "2026-10-12");
  assert.equal(d.tashkentDate(T("00:30", "2026-10-13")), "2026-10-13");
  assert.equal(d.workingMs(T("10:00"), T("10:45"), START, END), 45 * 60_000);
  assert.equal(d.workingMs(T("19:50"), T("09:20", "2026-10-13"), START, END), 30 * 60_000, "10 min tonight + 20 min tomorrow");
  assert.equal(d.workingMs(T("22:00"), T("08:00", "2026-10-13"), START, END), 0, "night does not count");
  assert.equal(d.parseMinute("09:00"), 540);
  assert.equal(d.parseMinute("9:30"), 570);
  assert.equal(d.parseMinute("24:00"), null);
  assert.equal(d.formatMinute(1200), "20:00");
  assert.equal(d.digestDue(T("09:05"), START, END, "2026-10-11"), true);
  assert.equal(d.digestDue(T("09:05"), START, END, "2026-10-12"), false, "once a day");
  assert.equal(d.digestDue(T("08:50"), START, END, null), false);
  assert.equal(d.reportDue(T("20:00"), END, "2026-10-11"), true);
  assert.equal(d.reportDue(T("19:59"), END, null), false);
  assert.equal(d.reportDue(T("20:30"), END, "2026-10-12"), false, "once a day");
});

test("reminder times: 30 min → admins, 2 h → + Super Admin; only working time counts", () => {
  const base = { status: "UNREAD", waitingSince: T("14:00"), deferred: false, reminded30At: null, reminded2hAt: null };
  assert.equal(d.dueReminder(base, T("14:29"), START, END), null);
  assert.equal(d.dueReminder(base, T("14:30"), START, END), "first");
  assert.equal(d.dueReminder({ ...base, reminded30At: T("14:30") }, T("15:59"), START, END), null, "first sent once");
  assert.equal(d.dueReminder({ ...base, reminded30At: T("14:30") }, T("16:00"), START, END), "second");
  assert.equal(d.dueReminder(base, T("16:10"), START, END), "second", "late tick: only the 2 h one");
  assert.equal(d.dueReminder({ ...base, reminded30At: T("14:30"), reminded2hAt: T("16:00") }, T("18:00"), START, END), null);
  assert.equal(d.dueReminder({ ...base, status: "OPENED" }, T("14:30"), START, END), "first", "opened but not answered");
  assert.equal(d.dueReminder({ ...base, status: "ANSWERED" }, T("15:00"), START, END), null);
  assert.equal(d.dueReminder({ ...base, status: "DISMISSED" }, T("15:00"), START, END), null);
  const evening = { ...base, waitingSince: T("19:45") };
  assert.equal(d.dueReminder(evening, T("19:59"), START, END), null);
  assert.equal(d.dueReminder(evening, T("21:00"), START, END), null, "no reminders at night");
  assert.equal(d.dueReminder(evening, T("09:14", "2026-10-13"), START, END), null, "15 + 14 min");
  assert.equal(d.dueReminder(evening, T("09:15", "2026-10-13"), START, END), "first");
  assert.equal(d.dueReminder({ ...base, waitingSince: T("23:00"), deferred: true }, T("10:00", "2026-10-13"), START, END), null, "deferred: waits for the digest first");
  assert.equal(d.dueReminder({ ...base, waitingSince: T("23:00") }, T("09:30", "2026-10-13"), START, END), "first", "after the digest: 30 working minutes from 09:00");
  assert.match(d.reminderText("first", { username: "ali", name: null }, { text: "Narxi?", kind: "TEXT" }, 30 * 60_000), /^⏰ Kutyapti 30 daq: @ali — “Narxi\?”/);
});

test("digest and daily report texts", () => {
  const digest = d.digestText([{ username: "ali", name: null, last: { text: "Salom", kind: "TEXT" }, since: T("22:10", "2026-10-11") }, { username: null, name: "Vali", last: { text: null, kind: "IMAGE" }, since: T("06:30") }]);
  assert.match(digest, /2 ta/);
  assert.match(digest, /1\. @ali — “Salom” \(22:10\)/);
  assert.match(digest, /2\. Vali — 🖼 Rasm \(06:30\)/);
  const report = d.reportText("2026-10-12", { conversations: 7, answered: 5, responseMs: [10, 20, 30].map(m => m * 60_000), waiting: [{ username: "a", name: null, waitingMs: 45 * 60_000 }, { username: "b", name: null, waitingMs: 2 * 3_600_000 }] });
  assert.match(report, /Kelgan yozishmalar: 7/);
  assert.match(report, /Javob berilgan: 5/);
  assert.match(report, /Qaralmagan \/ javobsiz: 2/);
  assert.match(report, /O‘rtacha javob vaqti: 20 daq/);
  assert.match(report, /Eng uzoq kutgan: 2 soat/);
  assert.match(report, /1\. @b — 2 soat\n2\. @a — 45 daq/, "longest first");
  assert.match(d.reportText("2026-10-12", { conversations: 0, answered: 0, responseMs: [], waiting: [] }), /O‘rtacha javob vaqti: —/);
});

test("phone in a Direct message → lead; signed open link; attachment kinds", () => {
  assert.equal(d.extractPhone("Raqamim +998 90 123-45-67, qo'ng'iroq qiling"), "+998901234567");
  assert.equal(d.extractPhone("90 123 45 67"), "+998901234567");
  assert.equal(d.extractPhone("998931112233"), "+998931112233");
  assert.equal(d.extractPhone("+7 701 123 45 67"), "+77011234567");
  assert.equal(d.extractPhone("Narxi qancha? 2 dona kerak"), null);
  assert.equal(d.extractPhone("12000000 so'm"), null);
  assert.equal(d.extractPhone(null), null);
  const s = sign.openSignature("secret", "conv1234567890", "admin123456789");
  assert.equal(sign.validOpenSignature("secret", "conv1234567890", "admin123456789", s), true);
  assert.equal(sign.validOpenSignature("secret", "conv1234567890", "other12345678", s), false, "another admin cannot reuse it");
  assert.equal(sign.validOpenSignature("other", "conv1234567890", "admin123456789", s), false);
  assert.equal(sign.validOpenSignature(null, "conv1234567890", "admin123456789", s), false);
  assert.equal(d.directLink("ali.uz"), "https://ig.me/m/ali.uz");
  assert.equal(d.directLink(null), "https://www.instagram.com/direct/inbox/");
  assert.equal(rules.messageKind({ attachments: [{ type: "image" }] }), "IMAGE");
  assert.equal(rules.messageKind({ attachments: [{ type: "audio" }] }), "AUDIO");
  assert.equal(rules.messageKind({ attachments: [{ type: "ig_reel" }] }), "SHARE");
  assert.equal(rules.messageKind({ text: "salom" }), "TEXT");
  assert.equal(rules.messageKind({ attachments: [{ type: "weird" }] }), "OTHER");
  assert.equal(d.duration(90 * 60_000), "1 soat 30 daq");
});

test("wiring: echo before card, private-reply text saved before sending, Telegram buttons, crons, additive migration", async () => {
  const direct = await read("../lib/instagram/direct.ts");
  assert.match(direct, /const auto = isAutoEcho\(/);
  assert.match(direct, /createDirectLead/);
  assert.match(direct, /submissionKey = `igdm:\$\{conversation\.igsid\}`/, "one lead per person");
  assert.match(direct, /source: "INSTAGRAM_DM"/);
  assert.doesNotMatch(direct, /console\.\w+\([^\n]*(?:token|text|payload)\s*[,})]/i, "no tokens / message text in logs");
  const service = await read("../lib/instagram/service.ts");
  assert.ok(service.indexOf("await update({ dmText: dm, dmSentAt: new Date() });") < service.indexOf("await sendPrivateReply("), "the price DM text is known before its echo can arrive");
  const bot = await read("../app/api/telegram/webhook/route.ts");
  assert.match(bot, /\^\(\?:seh\|ws\|omb\|igrev\|igdm\):/);
  assert.match(bot, /after\(\(\) => directTick\(\)/);
  const vercel = JSON.parse(await read("../vercel.json"));
  for (const cron of vercel.crons) assert.match(cron.schedule, /^\d+ \d+ \* \* \*$/, "Hobby: daily crons only");
  assert.ok(vercel.crons.some(cron => cron.path.startsWith("/api/cron/instagram-direct")));
  const migration = await read("../prisma/migrations/20261017090000_add_instagram_direct_inbox/migration.sql");
  assert.doesNotMatch(migration.replace(/^--.*$/gm, ""), /\bDROP\b|DELETE FROM|\bTRUNCATE\b|ALTER COLUMN/i);
  const schema = await read("../prisma/schema.prisma");
  assert.match(schema, /directAutoAckEnabled Boolean\s+@default\(false\)/, "auto message off by default");
  assert.match(schema, /@@unique\(\[accountId, igsid\]\)/, "one conversation per customer per account");
});

test("cron: GitHub Actions calls the Direct tick every 5 minutes with CRON_SECRET; the endpoint checks it", async () => {
  const workflow = await read("../.github/workflows/instagram-direct-cron.yml");
  assert.match(workflow, /cron: "\*\/5 \* \* \* \*"/);
  assert.match(workflow, /https:\/\/buyukkaravan\.com\/api\/cron\/instagram-direct/);
  assert.match(workflow, /\$\{\{ secrets\.CRON_SECRET \}\}/);
  assert.match(workflow, /Authorization: Bearer \$CRON_SECRET/);
  assert.match(workflow, /exit 1/, "a non-2xx answer fails the run");
  assert.doesNotMatch(workflow, /echo[^\n]*\$CRON_SECRET/, "the secret is never printed");
  const route = await read("../app/api/cron/instagram-direct/route.ts");
  assert.match(route, /process\.env\.CRON_SECRET/);
  assert.match(route, /timingSafeEqual/);
  assert.match(route, /status: 401/);
});
