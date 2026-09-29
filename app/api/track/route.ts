import { createHash } from "node:crypto";
import { z } from "zod";
import { EVENT_TYPES, isBot } from "@/lib/referrals/rules";
import { recordVisitEvent, REF_COOKIE, VISIT_COOKIE, VISITOR_COOKIE } from "@/lib/referrals/tracking";

export const runtime = "nodejs";

const payloadSchema = z.object({ type: z.enum(EVENT_TYPES), path: z.string().trim().min(1).max(300).regex(/^\//) });

// Best-effort in-memory limits (per serverless instance). The IP is only hashed for this window, never stored.
const buckets = new Map<string, { count: number; start: number }>();
const WINDOW_MS = 60_000;
function limited(key: string, max: number) {
  const now = Date.now(), entry = buckets.get(key);
  if (!entry || now - entry.start > WINDOW_MS) { buckets.set(key, { count: 1, start: now }); if (buckets.size > 5000) buckets.clear(); return false; }
  entry.count += 1;
  return entry.count > max;
}
function cookie(header: string | null, name: string) { return header?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))?.[1]; }

export async function POST(request: Request) {
  const noContent = new Response(null, { status: 204 });
  if (isBot(request.headers.get("user-agent"))) return noContent;
  const cookies = request.headers.get("cookie");
  const visitorId = cookie(cookies, VISITOR_COOKIE), visitId = cookie(cookies, VISIT_COOKIE), linkId = cookie(cookies, REF_COOKIE);
  if (!visitorId || !visitId || !linkId) return noContent;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (limited(`v:${visitorId}`, 40) || limited(`i:${createHash("sha256").update(ip).digest("hex").slice(0, 16)}`, 200)) return new Response(null, { status: 429 });
  const text = await request.text().catch(() => "");
  if (text.length > 1000) return new Response(null, { status: 413 });
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return new Response(null, { status: 400 }); }
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) return new Response(null, { status: 400 });
  try { await recordVisitEvent({ visitorId, visitId, linkId }, parsed.data); }
  catch (error) { console.error("[Track]", { name: error instanceof Error ? error.name : "UnknownError" }); }
  return noContent;
}
