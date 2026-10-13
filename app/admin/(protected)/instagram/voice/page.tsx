import type { Metadata } from "next";
import Link from "next/link";
import { VoiceStudio } from "@/components/admin/instagram/voice-studio";
import "@/components/admin/instagram/instagram.css";
import { requireRole } from "@/lib/auth/require-admin";
import { MIGRATION_NEEDED, isMissingTable } from "@/lib/tts/rules";
import { listHistory, providersInfo, usageSummary } from "@/lib/tts/service";
import { storageReady } from "@/lib/tts/storage";

export const metadata: Metadata = { title: "Ovoz studiyasi — Admin | BUYUK KARAVAN" };
// "Ovoz yasash" runs as a server action of this page: a long script is several provider requests in a row.
export const maxDuration = 300;

/** History and usage; null when the TtsGeneration table is missing (migration not applied) — the page says so instead of failing. */
async function loadData() {
  try { return await Promise.all([listHistory(), usageSummary()]); }
  catch (error) { if (isMissingTable(error)) return null; throw error; }
}

/** Ovoz studiyasi (Super Admin): script → voice-over with Aisha / OpenAI / ElevenLabs, gallery and history. */
export default async function VoicePage() {
  await requireRole("SUPER_ADMIN");
  const [providers, data] = await Promise.all([providersInfo(), loadData()]);
  return <div className="bk">
    <div className="bk-head"><div><h1>Ovoz studiyasi</h1><p className="bk-muted">Ssenariy → ovoz (MP3 / WAV): sinab eshitish, ovozlar galereyasi va tarix</p></div></div>
    <nav className="bk-chips" aria-label="Instagram bo‘limlari" style={{ marginBottom: 16 }}>
      <Link className="bk-chip" href="/admin/instagram">Kommentlar</Link>
      <Link className="bk-chip" href="/admin/instagram?tab=direct">Direct</Link>
      <Link className="bk-chip" href="/admin/instagram?tab=stats">Statistika</Link>
      <Link className="bk-chip" href="/admin/instagram/stories">Storislar</Link>
      <Link className="bk-chip is-active" href="/admin/instagram/voice">Ovoz</Link>
    </nav>
    {data ? <VoiceStudio
      providers={providers}
      history={data[0].map(row => ({ id: row.id, text: row.text.slice(0, 160), chars: row.chars, lang: row.lang, provider: row.provider, voice: row.voiceName ?? row.voice, source: row.source, createdAt: row.createdAt.toISOString(), durationMs: row.durationMs, format: row.format, costUsd: row.costUsd, audioUrl: row.audioUrl }))}
      usage={data[1]} apiReady={!!process.env.TTS_API_TOKEN?.trim()} storageReady={storageReady()}
    /> : <p className="ig-warn" role="alert">⚠️ {MIGRATION_NEEDED}</p>}
  </div>;
}
