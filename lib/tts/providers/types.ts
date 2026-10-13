// The common shape of a TTS provider. A new provider = one file implementing TtsProvider + one line in ./index.ts.
import type { AudioFormat } from "../audio";

export type TtsVoice = {
  id: string;
  name: string;
  /** Language codes this voice is offered for; "all" = multilingual (any language of the provider). */
  langs: string[] | "all";
  gender?: "female" | "male" | "neutral";
  note?: string;
};

export type SynthesisInput = { text: string; lang: string; voice: string; speed: number; format: AudioFormat };

export type TtsProvider = {
  id: string;
  name: string;
  /** The env variable that holds the key (shown in the UI as "kalit kiritilmagan: …"). Never the value. */
  envKey: string;
  /** Superseded (kept working for old history / API callers, hidden in the studio). */
  legacy?: boolean;
  configured(env: Env): boolean;
  model(env: Env): string;
  /** Longest text for one request; longer text is split by sentences and the parts joined. */
  maxChars: number;
  formats: AudioFormat[];
  speed: { min: number; max: number; /** Only these languages honour speed (others: always 1). */ langs?: string[] };
  /** Language codes; a provider with an online catalog (VoiceLab) answers asynchronously. */
  languages(env: Env, fetcher?: typeof fetch): string[] | Promise<string[]>;
  voices(env: Env, fetcher?: typeof fetch): Promise<TtsVoice[]>;
  synthesize(input: SynthesisInput, env: Env, fetcher?: typeof fetch): Promise<Uint8Array>;
  /** Estimated USD for this many characters (the rates are env-overridable). */
  costUsd(chars: number, env: Env): number;
};

export type Env = Record<string, string | undefined>;

/** A provider answer that is not audio. `message` is from the provider's own error body — never contains our key. */
export class TtsProviderError extends Error {
  readonly provider: string;
  readonly status: number;
  constructor(provider: string, status: number, message: string) { super(message); this.name = "TtsProviderError"; this.provider = provider; this.status = status; }
}

/** The useful part of an error body: JSON message / detail fields or the first 200 characters. */
export async function errorMessage(response: Response) {
  const raw = await response.text().catch(() => "");
  try {
    const json = JSON.parse(raw) as Record<string, unknown>;
    const pick = (value: unknown): string | null => typeof value === "string" ? value : Array.isArray(value) ? pick(value[0]) : value && typeof value === "object" ? pick((value as Record<string, unknown>).message ?? (value as Record<string, unknown>).detail) : null;
    const found = pick(json.error) ?? pick(json.detail) ?? pick(json.message) ?? pick(json.transcript) ?? pick(json);
    if (found) return found.slice(0, 200);
  } catch { /* not JSON */ }
  return raw.replace(/\s+/g, " ").slice(0, 200) || `HTTP ${response.status}`;
}

export const key = (env: Env, name: string) => env[name]?.trim() || "";
export const rate = (env: Env, name: string, fallback: number) => { const value = Number(env[name]?.trim()); return Number.isFinite(value) && value >= 0 && env[name]?.trim() ? value : fallback; };
export const clampSpeed = (speed: number, range: { min: number; max: number }) => Math.min(range.max, Math.max(range.min, speed));
