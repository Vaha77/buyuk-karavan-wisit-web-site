import { NextResponse } from "next/server";
import { bearerMatches } from "@/lib/stories/auth";
import { MIGRATION_NEEDED, isMissingTable, parseTtsRequest } from "@/lib/tts/rules";
import { generateFull } from "@/lib/tts/service";

export const runtime = "nodejs";
// Long scripts are split into several provider requests (one after another).
export const maxDuration = 300;

/**
 * Text → voice-over. Authorization: Bearer TTS_API_TOKEN.
 * JSON body: { text, lang ("uz"…), provider ("aisha" | "openai" | "elevenlabs"), voice (id from GET /api/tts/voices), speed? (1), format? ("mp3" | "wav") }
 * Answers 201 { id, url (public), durationMs, durationSec, format, chars, chunks, costUsd, warning }.
 * 400 bad input / provider without a key · 401 · 429 monthly limit · 502 provider error.
 */
export async function POST(request: Request) {
  if (!bearerMatches(request.headers.get("authorization"), process.env.TTS_API_TOKEN)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "JSON body yuboring." }, { status: 400 });
  const parsed = parseTtsRequest(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const result = await generateFull(parsed.value, { source: "api", actor: "API" });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ id: result.id, url: result.url, durationMs: result.durationMs, durationSec: Math.round(result.durationMs / 100) / 10, format: result.format, chars: result.chars, chunks: result.chunks, costUsd: result.costUsd, warning: result.warning }, { status: 201 });
  } catch (error) {
    if (isMissingTable(error)) return NextResponse.json({ error: MIGRATION_NEEDED }, { status: 503 });
    console.error("TTS API failed", { type: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json({ error: "Ovoz yasab bo‘lmadi." }, { status: 500 });
  }
}
