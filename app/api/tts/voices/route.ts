import { NextResponse } from "next/server";
import { bearerMatches } from "@/lib/stories/auth";
import { voicesFor } from "@/lib/tts/providers";
import { LANGUAGES } from "@/lib/tts/rules";
import { providersInfo } from "@/lib/tts/service";

export const runtime = "nodejs";

/**
 * Providers with their languages and voices. Authorization: Bearer TTS_API_TOKEN. Optional ?lang=uz keeps only the
 * voices of that language. A provider without its key is listed with configured: false ("kalit kiritilmagan").
 */
export async function GET(request: Request) {
  if (!bearerMatches(request.headers.get("authorization"), process.env.TTS_API_TOKEN)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const lang = new URL(request.url).searchParams.get("lang")?.trim().toLowerCase() || null;
  const providers = (await providersInfo())
    .filter(provider => !lang || provider.languages.includes(lang))
    .map(provider => ({ ...provider, voices: lang ? voicesFor(provider.voices, lang) : provider.voices }));
  return NextResponse.json({ languages: LANGUAGES, providers });
}
