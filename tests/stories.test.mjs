import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";

register("./ts-resolve.mjs", import.meta.url);
const r = await import("../lib/stories/rules.ts");
const { bearerMatches } = await import("../lib/stories/auth.ts");
const read = path => readFile(new URL(path, import.meta.url), "utf8");

// ---- A minimal MP4: ftyp + moov(mvhd + trak(tkhd)) ---------------------------------------------------------
const u32 = value => { const b = Buffer.alloc(4); b.writeUInt32BE(value >>> 0); return b; };
const i32 = value => { const b = Buffer.alloc(4); b.writeInt32BE(value); return b; };
const box = (type, ...parts) => { const body = Buffer.concat(parts); return Buffer.concat([u32(body.length + 8), Buffer.from(type, "ascii"), body]); };
function mp4({ seconds, width, height, rotate = false }) {
  const timescale = 1000;
  const mvhd = box("mvhd", Buffer.from([0, 0, 0, 0]), u32(0), u32(0), u32(timescale), u32(seconds * timescale), Buffer.alloc(80));
  const fixed = value => i32(Math.round(value * 65536));
  const matrix = rotate ? [fixed(0), fixed(1), u32(0), fixed(-1), fixed(0), u32(0), u32(0), u32(0), u32(0x40000000)] : [fixed(1), fixed(0), u32(0), fixed(0), fixed(1), u32(0), u32(0), u32(0), u32(0x40000000)];
  const tkhd = box("tkhd", Buffer.from([0, 0, 0, 3]), u32(0), u32(0), u32(1), u32(0), u32(seconds * timescale), Buffer.alloc(8), Buffer.alloc(8), ...matrix, fixed(width), fixed(height));
  return new Uint8Array(Buffer.concat([box("ftyp", Buffer.from("isom"), u32(512), Buffer.from("isomiso2mp41")), box("moov", mvhd, box("trak", tkhd)), box("mdat", Buffer.alloc(16))]));
}

test("API auth: Bearer STORY_QUEUE_TOKEN, constant-time; no token configured → closed", () => {
  assert.equal(bearerMatches("Bearer s3cret-token", "s3cret-token"), true);
  assert.equal(bearerMatches("Bearer s3cret-token ", " s3cret-token"), true, "surrounding spaces ignored");
  assert.equal(bearerMatches("Bearer wrong", "s3cret-token"), false);
  assert.equal(bearerMatches("s3cret-token", "s3cret-token"), false, "the Bearer scheme is required");
  assert.equal(bearerMatches(null, "s3cret-token"), false);
  assert.equal(bearerMatches("Bearer ", ""), false);
  assert.equal(bearerMatches("Bearer anything", undefined), false, "no env token → nobody gets in");
});

test("video check: MP4, 9:16, 3–60 s, ≤100 MB (duration from mvhd, size from tkhd, rotation applied)", () => {
  const good = mp4({ seconds: 15, width: 1080, height: 1920 });
  assert.deepEqual(r.readMp4Info(good), { durationMs: 15000, width: 1080, height: 1920 });
  assert.deepEqual(r.checkStoryVideo(good), { ok: true, info: { durationMs: 15000, width: 1080, height: 1920 } });
  const rotated = mp4({ seconds: 20, width: 1920, height: 1080, rotate: true });
  assert.deepEqual(r.readMp4Info(rotated), { durationMs: 20000, width: 1080, height: 1920 }, "phone video stored landscape + 90° matrix");
  assert.equal(r.checkStoryVideo(rotated).ok, true);
  assert.match(r.checkStoryVideo(mp4({ seconds: 2, width: 1080, height: 1920 })).error, /3–60 soniya/);
  assert.match(r.checkStoryVideo(mp4({ seconds: 61, width: 1080, height: 1920 })).error, /3–60 soniya/);
  assert.equal(r.checkStoryVideo(mp4({ seconds: 3, width: 720, height: 1280 })).ok, true, "edges are allowed");
  assert.equal(r.checkStoryVideo(mp4({ seconds: 60, width: 1080, height: 1916 })).ok, true, "a few pixels off 9:16 is fine");
  assert.match(r.checkStoryVideo(mp4({ seconds: 10, width: 1920, height: 1080 })).error, /9:16/);
  assert.match(r.checkStoryVideo(mp4({ seconds: 10, width: 1080, height: 1080 })).error, /9:16/);
  assert.match(r.checkStoryVideo(new Uint8Array(Buffer.from("not a video at all"))).error, /MP4/);
  assert.match(r.checkStoryVideo(good, 101 * 1024 * 1024).error, /100 MB/);
  assert.match(r.checkStoryVideo(new Uint8Array(0)).error, /bo‘sh/);
  assert.equal(r.readMp4Info(good.slice(0, 40)), null, "truncated file");
});

test("time: Tashkent local or ISO; not in the past, not over 60 days ahead", () => {
  assert.equal(r.parseScheduledAt("2026-10-12T11:00").toISOString(), "2026-10-12T06:00:00.000Z");
  assert.equal(r.parseScheduledAt("2026-10-12 11:00").toISOString(), "2026-10-12T06:00:00.000Z");
  assert.equal(r.parseScheduledAt("2026-10-12T06:00:00Z").toISOString(), "2026-10-12T06:00:00.000Z");
  assert.equal(r.parseScheduledAt("2026-10-12T11:00:00+05:00").toISOString(), "2026-10-12T06:00:00.000Z");
  assert.equal(r.parseScheduledAt("2026-02-30T11:00"), null);
  assert.equal(r.parseScheduledAt("tomorrow"), null);
  assert.equal(r.parseScheduledAt(null), null);
  const now = new Date("2026-10-12T06:00:00Z");
  assert.equal(r.scheduleError(new Date("2026-10-12T05:55:00Z"), now), null, "a few minutes ago is fine");
  assert.match(r.scheduleError(new Date("2026-10-12T05:00:00Z"), now), /o‘tib/);
  assert.match(r.scheduleError(new Date("2027-01-01T00:00:00Z"), now), /60 kun/);
  assert.equal(r.formatTashkent(new Date("2026-10-12T06:00:00Z")), "12.10 11:00");
  assert.equal(r.toLocalInput(new Date("2026-10-12T06:00:00Z")), "2026-10-12T11:00");
});

test("status machine: PENDING_APPROVAL → APPROVED → PUBLISHING → PUBLISHED | REJECTED | FAILED | EXPIRED", () => {
  assert.equal(r.nextStatus("PENDING_APPROVAL", "approve"), "APPROVED");
  assert.equal(r.nextStatus("APPROVED", "approve"), null, "approving twice is refused");
  assert.equal(r.nextStatus("PENDING_APPROVAL", "reject"), "REJECTED");
  assert.equal(r.nextStatus("APPROVED", "reject"), "REJECTED");
  assert.equal(r.nextStatus("PUBLISHED", "reject"), null);
  assert.equal(r.nextStatus("APPROVED", "claim"), "PUBLISHING");
  assert.equal(r.nextStatus("PENDING_APPROVAL", "claim"), null, "never published without approval");
  assert.equal(r.nextStatus("PUBLISHING", "published"), "PUBLISHED");
  assert.equal(r.nextStatus("PUBLISHING", "failed", 1), "APPROVED", "1st failure → retried");
  assert.equal(r.nextStatus("PUBLISHING", "failed", 2), "APPROVED", "2nd failure → retried");
  assert.equal(r.nextStatus("PUBLISHING", "failed", 3), "FAILED", "3rd failure (1 + 2 retries) → FAILED");
  assert.equal(r.MAX_ATTEMPTS, 3);
  assert.equal(r.nextStatus("PENDING_APPROVAL", "expire"), "EXPIRED");
  assert.equal(r.nextStatus("APPROVED", "expire"), null, "approved stories never expire");
  assert.equal(r.nextStatus("APPROVED", "reschedule"), "APPROVED");
  assert.equal(r.nextStatus("EXPIRED", "reschedule"), "PENDING_APPROVAL", "an expired story goes back for approval");
  assert.equal(r.nextStatus("FAILED", "reschedule"), "PENDING_APPROVAL");
  assert.equal(r.nextStatus("PUBLISHED", "reschedule"), null);
});

test("cron selection: due approved items, containers to check, expiry at 18:00 Tashkent", () => {
  const now = new Date("2026-10-12T06:00:00Z"); // 11:00 Tashkent
  const item = (status, at, extra = {}) => ({ status, scheduledAt: new Date(at), lockedUntil: null, igContainerId: null, ...extra });
  assert.equal(r.isDue(item("APPROVED", "2026-10-12T05:50:00Z"), now), true);
  assert.equal(r.isDue(item("APPROVED", "2026-10-12T06:30:00Z"), now), false, "not yet");
  assert.equal(r.isDue(item("PENDING_APPROVAL", "2026-10-12T05:50:00Z"), now), false, "not approved");
  assert.equal(r.isDue(item("APPROVED", "2026-10-12T05:50:00Z", { lockedUntil: new Date("2026-10-12T06:01:00Z") }), now), false, "another run holds it");
  assert.equal(r.isDue(item("APPROVED", "2026-10-12T05:50:00Z", { lockedUntil: new Date("2026-10-12T05:59:00Z") }), now), true, "an old lock is ignored");
  assert.equal(r.needsContainerCheck(item("PUBLISHING", "2026-10-12T05:50:00Z", { igContainerId: "1789" }), now), true);
  assert.equal(r.needsContainerCheck(item("PUBLISHING", "2026-10-12T05:50:00Z"), now), false);
  // Expiry: unapproved after 18:00 of its day (or its own time if later).
  assert.equal(r.expiresAt(new Date("2026-10-12T06:00:00Z")).toISOString(), "2026-10-12T13:00:00.000Z", "11:00 → 18:00");
  assert.equal(r.expiresAt(new Date("2026-10-12T15:00:00Z")).toISOString(), "2026-10-12T15:00:00.000Z", "20:00 → its own time");
  assert.equal(r.shouldExpire(item("PENDING_APPROVAL", "2026-10-12T06:00:00Z"), new Date("2026-10-12T12:59:00Z")), false, "17:59 — still waiting");
  assert.equal(r.shouldExpire(item("PENDING_APPROVAL", "2026-10-12T06:00:00Z"), new Date("2026-10-12T13:00:00Z")), true, "18:00 — expired");
  assert.equal(r.shouldExpire(item("APPROVED", "2026-10-12T06:00:00Z"), new Date("2026-10-13T00:00:00Z")), false);
  assert.equal(r.containerStep("FINISHED"), "publish");
  assert.equal(r.containerStep("IN_PROGRESS"), "wait");
  assert.equal(r.containerStep(null), "wait");
  assert.equal(r.containerStep("ERROR"), "fail");
  assert.equal(r.containerStep("EXPIRED"), "fail");
});

test("Telegram: buttons, callback parsing (≤64 bytes), texts", () => {
  const id = "cmg8x1a2b0000abcd1234efgh";
  const keyboard = r.approvalKeyboard(id, new Date("2026-10-12T06:00:00Z"));
  const buttons = keyboard.inline_keyboard.flat();
  assert.deepEqual(buttons.map(button => button.text), ["✅ Tasdiqlash", "❌ Rad etish", "✅ Hammasini tasdiqlash (12.10)"]);
  for (const button of buttons) assert.ok(Buffer.byteLength(button.callback_data) <= 64);
  assert.deepEqual(r.parseStoryCallback(`story:ok:${id}`), { kind: "ok", id });
  assert.deepEqual(r.parseStoryCallback(`story:no:${id}`), { kind: "no", id });
  assert.deepEqual(r.parseStoryCallback("story:day:2026-10-12"), { kind: "day", day: "2026-10-12" });
  assert.equal(r.parseStoryCallback("claim:abc"), null);
  assert.equal(r.parseStoryCallback("story:ok:bad id"), null);
  assert.equal(r.publishedText(new Date("2026-10-12T06:00:00Z")), "✅ Storis joylandi 11:00");
  assert.equal(r.failedText("Container: ERROR"), "⚠️ Storis xato: Container: ERROR");
  assert.match(r.approvalText({ scheduledAt: new Date("2026-10-12T06:00:00Z"), caption: "Bitzer agregat", durationMs: 15000 }), /🕐 12\.10 11:00[\s\S]*⏱ 15 s[\s\S]*📝 Bitzer agregat/);
  const { start, end } = r.dayBounds("2026-10-12");
  assert.deepEqual([start.toISOString(), end.toISOString()], ["2026-10-11T19:00:00.000Z", "2026-10-12T19:00:00.000Z"]);
});

test("wiring: auth on every endpoint, Super Admin only, token never in a URL or a log, additive migration", async () => {
  const queue = await read("../app/api/stories/queue/route.ts");
  assert.match(queue, /bearerMatches\(request\.headers\.get\("authorization"\), process\.env\.STORY_QUEUE_TOKEN\)\) return NextResponse\.json\(\{ error: "unauthorized" \}, \{ status: 401 \}\)/);
  const upload = await read("../app/api/stories/upload-url/route.ts");
  assert.match(upload, /process\.env\.STORY_QUEUE_TOKEN/);
  const cron = await read("../app/api/cron/instagram-stories/route.ts");
  assert.match(cron, /bearerMatches\(request\.headers\.get\("authorization"\), process\.env\.CRON_SECRET\)/);
  const workflow = await read("../.github/workflows/instagram-stories-cron.yml");
  assert.match(workflow, /cron: "\*\/10 \* \* \* \*"/);
  assert.match(workflow, /\$\{\{ secrets\.CRON_SECRET \}\}/);
  assert.match(workflow, /instagram-stories/);
  const telegram = await read("../lib/stories/telegram.ts");
  assert.match(telegram, /telegramChatId: String\(callback\.from\.id\), role: "SUPER_ADMIN"/, "callbacks only from a Super Admin chat");
  const bot = await read("../lib/telegram/service.ts");
  assert.match(bot, /handleStoryCallback\(update\.callback_query\)/);
  assert.doesNotMatch(await read("../lib/stories/service.ts"), /deleteWebhook/);
  const graph = await read("../lib/stories/graph.ts");
  assert.match(graph, /media_type: "STORIES", video_url: videoUrl/);
  assert.match(graph, /media_publish/);
  assert.match(graph, /status_code/);
  assert.doesNotMatch(graph, /console\.\w+\(/, "nothing logged from the publish client");
  assert.doesNotMatch(graph, /\?access_token=|access_token=\$\{/, "token never in a URL");
  assert.match(graph, /process\.env\.IG_PUBLISH_TOKEN/);
  const page = await read("../app/admin/(protected)/instagram/stories/page.tsx");
  assert.match(page, /requireRole\("SUPER_ADMIN"\)/);
  const actions = await read("../app/admin/(protected)/instagram/stories/actions.ts");
  assert.match(actions, /requireRole\("SUPER_ADMIN"\)/);
  assert.match(actions, /export async function publishNowAction/);
  const service = await read("../lib/stories/service.ts");
  assert.match(service, /if \(item\.status !== "APPROVED"\) return \{ ok: false as const, error: "Faqat tasdiqlangan/, "Hozir joylash: approved only");
  const board = await read("../components/admin/instagram/stories-board.tsx");
  assert.match(board, /type="file" accept="video\/mp4" multiple/);
  assert.match(board, /type="datetime-local"/);
  assert.match(board, /Hozir joylash/);
  const migration = await read("../prisma/migrations/20261022090000_add_story_queue/migration.sql");
  assert.doesNotMatch(migration.replace(/^--.*$/gm, ""), /\bDROP\b|DELETE FROM|\bTRUNCATE\b|ALTER COLUMN/i);
});
