import type { Metadata } from "next";
import { InstagramNav, pickAccount } from "@/components/admin/instagram/account-nav";
import { VoiceStudio } from "@/components/admin/instagram/voice-studio";
import "@/components/admin/instagram/instagram.css";
import { requireRole } from "@/lib/auth/require-admin";
import { getAccountOptions } from "@/lib/instagram/queries";
import { FIRST_ACCOUNT_ID } from "@/lib/instagram/service";
import { MIGRATION_NEEDED, creditsPerChar, estimateCredits, isCreditProvider, isMissingTable } from "@/lib/tts/rules";
import { listHistory, providersInfo, usageSummary } from "@/lib/tts/service";
import { storageReady } from "@/lib/tts/storage";

export const metadata: Metadata = { title: "Ovoz studiyasi — Admin | BUYUK KARAVAN" };
// "Ovoz yasash" runs as a server action of this page: a long script is several provider requests in a row.
export const maxDuration = 300;

/** History and usage; null when the TtsGeneration table is missing (migration not applied) — the page says so instead of failing. */
async function loadData(accountId: string) {
  try { return await Promise.all([listHistory(accountId), usageSummary()]); }
  catch (error) { if (isMissingTable(error)) return null; throw error; }
}

/** Ovoz studiyasi (Super Admin): script → voice-over with Aisha / OpenAI / ElevenLabs, gallery and the account's history. */
export default async function VoicePage({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  await requireRole("SUPER_ADMIN");
  const accounts = await getAccountOptions();
  const accountId = pickAccount(accounts, (await searchParams).account)?.id ?? FIRST_ACCOUNT_ID;
  const [providers, data] = await Promise.all([providersInfo(), loadData(accountId)]);
  return <div className="bk">
    <div className="bk-head"><div><h1>Ovoz studiyasi</h1><p className="bk-muted">Ssenariy → ovoz (MP3 / WAV): sinab eshitish, ovozlar galereyasi va tarix</p></div></div>
    <InstagramNav accounts={accounts} accountId={accountId} active="voice" isSuper/>
    {data ? <VoiceStudio
      accountId={accountId}
      providers={providers}
      history={data[0].map(row => ({ id: row.id, text: row.text.slice(0, 160), chars: row.chars, lang: row.lang, provider: row.provider, voice: row.voiceName ?? row.voice, source: row.source, createdAt: row.createdAt.toISOString(), durationMs: row.durationMs, format: row.format, costUsd: row.costUsd, credits: row.credits ?? (isCreditProvider(row.provider) ? estimateCredits(row.chars, creditsPerChar(process.env)) : null), creditsExact: row.creditsExact && row.credits !== null, audioUrl: row.audioUrl }))}
      usage={data[1]} apiReady={!!process.env.TTS_API_TOKEN?.trim()} storageReady={storageReady()}
    /> : <p className="ig-warn" role="alert">⚠️ {MIGRATION_NEEDED}</p>}
  </div>;
}
