// Provider registry. To add one: implement TtsProvider in its own file and list it here.
import { aishaProvider } from "./aisha";
import { elevenlabsProvider } from "./elevenlabs";
import { openaiProvider } from "./openai";
import type { Env, TtsProvider, TtsVoice } from "./types";
import { voicelabProvider } from "./voicelab";

/** VoiceLab first (Uzbek). Aisha (back.aisha.group) is legacy: still callable, hidden in the studio and the voices API. */
export const PROVIDERS: TtsProvider[] = [voicelabProvider, openaiProvider, elevenlabsProvider, aishaProvider];
export const getProvider = (id: string) => PROVIDERS.find(provider => provider.id === id) ?? null;

/** What the UI and GET /api/tts/voices show: every provider (configured or not — never the key) with its voices. */
export type ProviderInfo = {
  id: string; name: string; configured: boolean; legacy: boolean; status: string; envKey: string; model: string;
  maxChars: number; formats: string[]; speed: { min: number; max: number; langs?: string[] }; languages: string[]; voices: TtsVoice[]; usdPer1k: number;
};

export async function describeProviders(env: Env, fetcher?: typeof fetch, { legacy = false } = {}): Promise<ProviderInfo[]> {
  return Promise.all(PROVIDERS.filter(provider => legacy || !provider.legacy).map(async provider => {
    const configured = provider.configured(env);
    const [languages, voices] = await Promise.all([provider.languages(env, fetcher), provider.voices(env, fetcher)]);
    return {
      id: provider.id, name: provider.name, configured, legacy: !!provider.legacy, status: configured ? "tayyor" : `kalit kiritilmagan (${provider.envKey})`, envKey: provider.envKey,
      model: provider.model(env), maxChars: provider.maxChars, formats: provider.formats, speed: provider.speed, languages, voices, usdPer1k: provider.costUsd(1000, env),
    };
  }));
}

/** Voices of a provider that speak `lang`. */
export const voicesFor = (voices: TtsVoice[], lang: string) => voices.filter(voice => voice.langs === "all" || voice.langs.includes(lang));

/** Display name for a provider id (history rows of a hidden / removed provider included). */
export const providerName = (id: string) => getProvider(id)?.name ?? id;
