// ElevenLabs (optional): ELEVENLABS_API_KEY, model ELEVENLABS_MODEL (default eleven_multilingual_v2; eleven_v3 adds
// Uzbek, Kazakh …). Voices come from the account (GET /v1/voices), with the premade ones as a fallback.
import { TtsProviderError, clampSpeed, errorMessage, key, rate, type Env, type TtsProvider, type TtsVoice } from "./types";

const BASE = "https://api.elevenlabs.io";
const DEFAULT_MODEL = "eleven_multilingual_v2";
const MULTILINGUAL_V2 = ["en", "ja", "zh", "de", "hi", "fr", "ko", "pt", "it", "es", "id", "nl", "tr", "pl", "sv", "bg", "ro", "ar", "cs", "el", "fi", "hr", "ms", "sk", "da", "ta", "uk", "ru"];
const V3_EXTRA = ["uz", "kk", "ky", "tg", "az", "fa", "ur", "vi", "th", "he", "hu"];
const PREMADE: TtsVoice[] = [
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", langs: "all", gender: "female" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", langs: "all", gender: "female" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam", langs: "all", gender: "male" },
  { id: "ErXwobaYiN019PkySvjV", name: "Antoni", langs: "all", gender: "male" },
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh", langs: "all", gender: "male" },
];
const model = (env: Env) => env.ELEVENLABS_MODEL?.trim() || DEFAULT_MODEL;
const SPEED = { min: 0.7, max: 1.2 };

export const elevenlabsProvider: TtsProvider = {
  id: "elevenlabs",
  name: "ElevenLabs",
  envKey: "ELEVENLABS_API_KEY",
  configured: env => !!key(env, "ELEVENLABS_API_KEY"),
  model,
  maxChars: 4500,
  formats: ["mp3"],
  speed: SPEED,
  languages: env => model(env).includes("v3") ? [...MULTILINGUAL_V2, ...V3_EXTRA] : MULTILINGUAL_V2,
  async voices(env, fetcher = fetch) {
    if (!key(env, "ELEVENLABS_API_KEY")) return PREMADE;
    try {
      const response = await fetcher(`${BASE}/v1/voices`, { headers: { "xi-api-key": key(env, "ELEVENLABS_API_KEY") }, signal: AbortSignal.timeout(8_000) });
      if (!response.ok) return PREMADE;
      const json = await response.json() as { voices?: Array<{ voice_id?: string; name?: string; category?: string; labels?: Record<string, string> }> };
      const voices = (json.voices ?? []).filter(voice => voice.voice_id && voice.name).map(voice => ({
        id: voice.voice_id!, name: voice.name!, langs: "all" as const,
        gender: voice.labels?.gender === "female" ? "female" as const : voice.labels?.gender === "male" ? "male" as const : undefined,
        note: voice.category && voice.category !== "premade" ? voice.category : undefined,
      }));
      return voices.length ? voices : PREMADE;
    } catch { return PREMADE; }
  },
  async synthesize(input, env, fetcher = fetch) {
    if (!/^[A-Za-z0-9]{8,40}$/.test(input.voice)) throw new TtsProviderError("elevenlabs", 400, "voice_id noto‘g‘ri.");
    const response = await fetcher(`${BASE}/v1/text-to-speech/${input.voice}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": key(env, "ELEVENLABS_API_KEY"), "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text: input.text, model_id: model(env), language_code: model(env).includes("multilingual_v2") ? undefined : input.lang, voice_settings: { speed: clampSpeed(input.speed, SPEED) } }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw new TtsProviderError("elevenlabs", response.status, await errorMessage(response));
    return new Uint8Array(await response.arrayBuffer());
  },
  costUsd: (chars, env) => Math.round(chars * rate(env, "ELEVENLABS_USD_PER_1K_CHARS", 0.2) / 1000 * 1e6) / 1e6,
};
