// OpenAI TTS (POST /v1/audio/speech) with OPENAI_API_KEY. Model: OPENAI_TTS_MODEL (default gpt-4o-mini-tts; tts-1 /
// tts-1-hd also work). All voices are multilingual; the language goes into `instructions` (gpt-4o-* models).
import { LANGUAGES, languageName } from "../rules";
import { TtsProviderError, clampSpeed, errorMessage, key, rate, type Env, type TtsProvider, type TtsVoice } from "./types";

const DEFAULT_MODEL = "gpt-4o-mini-tts";
const LEGACY_VOICES = ["alloy", "ash", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer"];
const VOICES: TtsVoice[] = [
  { id: "alloy", name: "Alloy", langs: "all", gender: "neutral" },
  { id: "ash", name: "Ash", langs: "all", gender: "male" },
  { id: "ballad", name: "Ballad", langs: "all", gender: "male" },
  { id: "coral", name: "Coral", langs: "all", gender: "female" },
  { id: "echo", name: "Echo", langs: "all", gender: "male" },
  { id: "fable", name: "Fable", langs: "all", gender: "neutral" },
  { id: "onyx", name: "Onyx", langs: "all", gender: "male" },
  { id: "nova", name: "Nova", langs: "all", gender: "female" },
  { id: "sage", name: "Sage", langs: "all", gender: "female" },
  { id: "shimmer", name: "Shimmer", langs: "all", gender: "female" },
  { id: "verse", name: "Verse", langs: "all", gender: "male" },
  { id: "marin", name: "Marin", langs: "all", gender: "female", note: "eng tabiiy" },
  { id: "cedar", name: "Cedar", langs: "all", gender: "male", note: "eng tabiiy" },
];
/** USD per 1000 characters (gpt-4o-mini-tts is billed by tokens / minutes; ≈ $0.015 per minute ≈ 900 characters). */
const USD_PER_1K: Record<string, number> = { "tts-1": 0.015, "tts-1-hd": 0.03, "gpt-4o-mini-tts": 0.017 };

const model = (env: Env) => env.OPENAI_TTS_MODEL?.trim() || DEFAULT_MODEL;
const legacy = (env: Env) => model(env).startsWith("tts-1");

export const openaiProvider: TtsProvider = {
  id: "openai",
  name: "OpenAI",
  envKey: "OPENAI_API_KEY",
  configured: env => !!key(env, "OPENAI_API_KEY"),
  model,
  maxChars: 4000,
  formats: ["mp3", "wav"],
  speed: { min: 0.25, max: 4 },
  languages: () => Object.keys(LANGUAGES),
  voices: async env => legacy(env) ? VOICES.filter(voice => LEGACY_VOICES.includes(voice.id)) : VOICES,
  async synthesize(input, env, fetcher = fetch) {
    const speed = clampSpeed(input.speed, openaiProvider.speed);
    const body: Record<string, unknown> = { model: model(env), voice: input.voice, input: input.text, response_format: input.format };
    if (legacy(env)) body.speed = speed;
    else {
      const pace = speed < 0.9 ? " Speak slowly." : speed > 1.1 ? " Speak a little faster than usual." : "";
      body.instructions = `Read the text in ${englishName(input.lang)}, naturally and clearly, like a friendly advertising voice-over.${pace}`;
    }
    const response = await fetcher("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${key(env, "OPENAI_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw new TtsProviderError("openai", response.status, await errorMessage(response));
    return new Uint8Array(await response.arrayBuffer());
  },
  costUsd: (chars, env) => Math.round(chars * rate(env, "OPENAI_TTS_USD_PER_1K_CHARS", USD_PER_1K[model(env)] ?? 0.017) / 1000 * 1e6) / 1e6,
};

const ENGLISH: Record<string, string> = { uz: "Uzbek", ru: "Russian", en: "English", zh: "Mandarin Chinese", ko: "Korean", tr: "Turkish", kk: "Kazakh", ky: "Kyrgyz", tg: "Tajik", az: "Azerbaijani", tk: "Turkmen", de: "German", fr: "French", es: "Spanish", it: "Italian", pt: "Portuguese", ar: "Arabic", fa: "Persian", hi: "Hindi", ur: "Urdu", ja: "Japanese", uk: "Ukrainian", pl: "Polish", nl: "Dutch", id: "Indonesian", ms: "Malay", vi: "Vietnamese", th: "Thai", he: "Hebrew", el: "Greek", cs: "Czech", ro: "Romanian", hu: "Hungarian", sv: "Swedish", fi: "Finnish", da: "Danish", bg: "Bulgarian", hr: "Croatian", sk: "Slovak", ta: "Tamil" };
const englishName = (lang: string) => ENGLISH[lang] ?? languageName(lang);
