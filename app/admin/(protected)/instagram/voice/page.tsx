import type { Metadata } from "next";
import Link from "next/link";
import { VoiceStudio } from "@/components/admin/instagram/voice-studio";
import "@/components/admin/instagram/instagram.css";
import { requireRole } from "@/lib/auth/require-admin";
import { listHistory, providersInfo, usageSummary } from "@/lib/tts/service";
import { storageReady } from "@/lib/tts/storage";

export const metadata: Metadata = { title: "Ovoz studiyasi — Admin | BUYUK KARAVAN" };
// "Ovoz yasash" runs as a server action of this page: a long script is several provider requests in a row.
export const maxDuration = 300;

/** Ovoz studiyasi (Super Admin): script → voice-over with Aisha / OpenAI / ElevenLabs, gallery and history. */
export default async function VoicePage() {
  await requireRole("SUPER_ADMIN");
  const [providers, history, usage] = await Promise.all([providersInfo(), listHistory(), usageSummary()]);
  return <div className="bk">
    <div className="bk-head"><div><h1>Ovoz studiyasi</h1><p className="bk-muted">Ssenariy → ovoz (MP3 / WAV): sinab eshitish, ovozlar galereyasi va tarix</p></div></div>
    <nav className="bk-chips" aria-label="Instagram bo‘limlari" style={{ marginBottom: 16 }}>
      <Link className="bk-chip" href="/admin/instagram">Kommentlar</Link>
      <Link className="bk-chip" href="/admin/instagram?tab=direct">Direct</Link>
      <Link className="bk-chip" href="/admin/instagram?tab=stats">Statistika</Link>
      <Link className="bk-chip" href="/admin/instagram/stories">Storislar</Link>
      <Link className="bk-chip is-active" href="/admin/instagram/voice">Ovoz</Link>
    </nav>
    <VoiceStudio
      providers={providers}
      history={history.map(row => ({ id: row.id, text: row.text.slice(0, 160), chars: row.chars, lang: row.lang, provider: row.provider, voice: row.voiceName ?? row.voice, source: row.source, createdAt: row.createdAt.toISOString(), durationMs: row.durationMs, format: row.format, costUsd: row.costUsd, audioUrl: row.audioUrl }))}
      usage={usage} apiReady={!!process.env.TTS_API_TOKEN?.trim()} storageReady={storageReady()}
    />
  </div>;
}
