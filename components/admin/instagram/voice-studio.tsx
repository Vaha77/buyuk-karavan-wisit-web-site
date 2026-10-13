"use client";
// /admin/instagram/voice (Super Admin): ssenariy → ovoz. "Sinab eshitish" (first ~200 characters), "Ovoz yasash" (the
// whole text, saved), "Ovozlar galereyasi" (every voice of the language reads one sentence, one after another) and the
// history with play / download / delete.
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Headphones, Mic, Play, Square, Trash2 } from "lucide-react";
import { deleteVoiceAction, generateVoiceAction, previewVoiceAction, sampleVoiceAction, type VoiceActionResult } from "@/app/admin/(protected)/instagram/voice/actions";
import { BusyLabel } from "@/components/admin/feedback";
import type { ProviderInfo } from "@/lib/tts/providers";
import { providerName, voicesFor } from "@/lib/tts/providers";
import { LANGUAGES, MAIN_LANGUAGES, PREVIEW_CHARS, formatDuration, languageName, splitText } from "@/lib/tts/rules";

export type VoiceHistoryRow = { id: string; text: string; chars: number; lang: string; provider: string; voice: string; source: string; createdAt: string; durationMs: number | null; format: string; costUsd: number; credits: number | null; creditsExact: boolean; audioUrl: string | null };
type ProviderUsage = { id: string; name: string; monthUsd: number; monthChars: number; monthCount: number; todayCount: number; credits: { used: number; exact: boolean; base: number; balance: number | null } | null };
type Usage = { providers: ProviderUsage[]; monthUsd: number; monthChars: number; monthCount: number; todayCount: number; limits: { monthlyUsd: number | null; monthlyChars: number | null; dailyWarn: number | null }; warning: string | null };
type Done = Extract<VoiceActionResult, { ok: true }>;
type GalleryState = Record<string, { state: "loading" | "playing" | "done" | "error"; url?: string; error?: string }>;

const dateTime = (iso: string) => new Intl.DateTimeFormat("uz-UZ", { timeZone: "Asia/Tashkent", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const usd = (value: number) => `$${value < 0.01 && value > 0 ? value.toFixed(4) : value.toFixed(2)}`;
const num = (value: number) => new Intl.NumberFormat("ru-RU").format(value);
/** "717 kredit" (VoiceLab's own number) or "≈ 717 kredit" (estimated from characters). */
const creditText = (credits: number, exact: boolean) => `${exact ? "" : "≈ "}${num(credits)} kredit`;
const BADGE: Record<string, string> = { openai: "OpenAI", voicelab: "VoiceLab", elevenlabs: "ElevenLabs", aisha: "Aisha (eski)" };

/** One provider line of the "Bu oy / So‘rovlar" card with its progress bar. */
function UsageLine({ item, limitUsd }: { item: ProviderUsage; limitUsd: number | null }) {
  const credits = item.credits;
  const share = credits ? Math.min(100, credits.used / Math.max(1, credits.base) * 100) : limitUsd ? Math.min(100, item.monthUsd / limitUsd * 100) : 0;
  const main = credits ? `${creditText(credits.used, credits.exact)} / ${num(credits.base)}` : `≈ ${usd(item.monthUsd)}${limitUsd !== null ? ` / $${limitUsd}` : ""}`;
  const rest = credits ? (credits.balance !== null ? `Qoldiq: ${num(credits.balance)} kredit` : `Qoldiq ≈ ${num(Math.max(0, credits.base - credits.used))} (taxminiy — VoiceLab API balans bermaydi)`) : null;
  return <div className="ig-voice-line">
    <div className="ig-voice-line-head"><b>{item.name}</b><span>{main}</span></div>
    <div className="ig-voice-meter" role="progressbar" aria-label={`${item.name}: oylik sarf`} aria-valuenow={Math.round(share)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${share}%` }} className={share >= 90 ? "is-bad" : ""}/></div>
    <p className="bk-muted">{[`${num(item.monthChars)} belgi`, `${item.monthCount} so‘rov`, `bugun ${item.todayCount}`, rest].filter(Boolean).join(" · ")}</p>
  </div>;
}

/** Saves the file (fetch → blob, so the name sticks across origins); falls back to opening it. */
async function download(url: string, name: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(String(response.status));
    const href = URL.createObjectURL(await response.blob());
    const link = Object.assign(document.createElement("a"), { href, download: name });
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
  } catch { window.open(url, "_blank", "noopener"); }
}

/** Plays a URL on the given element and waits until it ends (or fails). */
function playToEnd(audio: HTMLAudioElement, url: string) {
  return new Promise<void>(resolve => {
    const done = () => { audio.removeEventListener("ended", done); audio.removeEventListener("error", done); audio.removeEventListener("pause", paused); resolve(); };
    const paused = () => { if (!audio.ended) done(); };
    audio.addEventListener("ended", done); audio.addEventListener("error", done); audio.addEventListener("pause", paused);
    audio.src = url;
    audio.play().catch(done);
  });
}

function Result({ result, title }: { result: Done; title: string }) {
  const name = `bk-ovoz-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.${result.format}`;
  return <div className="ig-voice-result" role="status">
    <div className="ig-voice-result-head"><b>{title}</b><span className="bk-muted">{[result.durationMs ? formatDuration(result.durationMs) : null, result.format.toUpperCase(), `${result.chars} belgi`, result.chunks > 1 ? `${result.chunks} qism` : null, result.credits !== null ? creditText(result.credits, result.creditsExact) : `≈ ${usd(result.costUsd)}`].filter(Boolean).join(" · ")}</span></div>
    <audio src={result.url} controls autoPlay preload="auto" className="ig-voice-audio"/>
    {result.id && <button type="button" className="bk-btn" onClick={() => void download(result.url, name)}><Download size={15}/>Yuklab olish</button>}
    {result.warning && <p className="ig-warn">{result.warning}</p>}
  </div>;
}

export function VoiceStudio({ providers, history, usage, apiReady, storageReady }: { providers: ProviderInfo[]; history: VoiceHistoryRow[]; usage: Usage; apiReady: boolean; storageReady: boolean }) {
  const router = useRouter();
  const languages = useMemo(() => {
    const spoken = new Set(providers.flatMap(provider => provider.languages));
    return [...MAIN_LANGUAGES.filter(code => spoken.has(code)), ...Object.keys(LANGUAGES).filter(code => spoken.has(code) && !MAIN_LANGUAGES.includes(code)), ...[...spoken].filter(code => !(code in LANGUAGES)).sort()];
  }, [providers]);
  const [text, setText] = useState("");
  const [lang, setLang] = useState("uz");
  const choices = providers.filter(provider => provider.languages.includes(lang));
  const firstReady = (code: string) => providers.find(provider => provider.configured && provider.languages.includes(code))?.id ?? providers.find(provider => provider.languages.includes(code))?.id ?? "";
  const [providerId, setProviderId] = useState(() => firstReady("uz"));
  const provider = providers.find(item => item.id === providerId) ?? null;
  const voices = provider ? voicesFor(provider.voices, lang) : [];
  const [voiceId, setVoiceId] = useState(() => voices[0]?.id ?? "");
  const [speed, setSpeed] = useState(1);
  const [format, setFormat] = useState<string>("mp3");
  const [busy, setBusy] = useState<"preview" | "full" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Done | null>(null);
  const [full, setFull] = useState<Done | null>(null);
  const [gallery, setGallery] = useState<GalleryState>({});
  const [galleryOn, setGalleryOn] = useState(false);
  const stopGallery = useRef(false), galleryAudio = useRef<HTMLAudioElement>(null);
  const [pending, startTransition] = useTransition();

  // Keep provider / voice / format valid when the language or provider changes.
  const pickLang = (code: string) => {
    setLang(code);
    const next = providers.find(item => item.id === providerId && item.languages.includes(code)) ? providerId : firstReady(code);
    setProviderId(next);
    const list = voicesFor(providers.find(item => item.id === next)?.voices ?? [], code);
    if (!list.some(voice => voice.id === voiceId)) setVoiceId(list[0]?.id ?? "");
    setGallery({});
  };
  const pickProvider = (id: string) => {
    setProviderId(id);
    const next = providers.find(item => item.id === id);
    setVoiceId(voicesFor(next?.voices ?? [], lang)[0]?.id ?? "");
    if (next && !next.formats.includes(format)) setFormat(next.formats[0]);
    setGallery({});
  };
  useEffect(() => () => { stopGallery.current = true; }, []);

  const speedRange = provider ? { min: Math.max(0.5, provider.speed.min), max: Math.min(2, provider.speed.max) } : { min: 0.5, max: 2 };
  const speedWorks = !provider?.speed.langs || provider.speed.langs.includes(lang);
  const maxChars = provider?.maxChars ?? 0;
  const chunks = maxChars && text.trim() ? splitText(text, maxChars).length : 0;
  const ready = !!provider?.configured && !!voiceId;
  const request = { text, lang, provider: providerId, voice: voiceId, speed: speedWorks ? speed : 1, format };

  const run = async (kind: "preview" | "full") => {
    if (!text.trim()) { setError("Matnni kiriting."); return; }
    setBusy(kind); setError(null);
    const result = kind === "preview" ? await previewVoiceAction(request) : await generateVoiceAction(request);
    setBusy(null);
    if (!result.ok) { setError(result.error); return; }
    if (kind === "preview") setPreview(result); else { setFull(result); router.refresh(); }
  };

  const playGallery = async () => {
    const audio = galleryAudio.current;
    if (!audio || !provider) return;
    stopGallery.current = false; setGalleryOn(true); setError(null);
    for (const voice of voices) {
      if (stopGallery.current) break;
      let url = gallery[voice.id]?.url;
      if (!url) {
        setGallery(state => ({ ...state, [voice.id]: { state: "loading" } }));
        const result = await sampleVoiceAction({ lang, provider: provider.id, voice: voice.id, speed: speedWorks ? speed : 1, format });
        if (!result.ok) { setGallery(state => ({ ...state, [voice.id]: { state: "error", error: result.error } })); if (/limit/i.test(result.error)) { setError(result.error); break; } continue; }
        url = result.url;
      }
      if (stopGallery.current) { setGallery(state => ({ ...state, [voice.id]: { state: "done", url } })); break; }
      setGallery(state => ({ ...state, [voice.id]: { state: "playing", url } }));
      await playToEnd(audio, url);
      setGallery(state => ({ ...state, [voice.id]: { state: "done", url } }));
    }
    setGalleryOn(false);
  };
  const playOne = async (id: string) => {
    const audio = galleryAudio.current, entry = gallery[id];
    if (!audio || !entry?.url) return;
    audio.pause();
    setGallery(state => ({ ...state, [id]: { ...entry, state: "playing" } }));
    await playToEnd(audio, entry.url);
    setGallery(state => ({ ...state, [id]: { ...entry, state: "done" } }));
  };
  const stop = () => { stopGallery.current = true; galleryAudio.current?.pause(); };

  const remove = (id: string) => {
    if (!window.confirm("Ovoz fayli o‘chirilsinmi?")) return;
    startTransition(async () => {
      const result = await deleteVoiceAction(id);
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  };

  const lines = usage.providers.filter(item => item.id === "openai" || item.id === "voicelab" || item.monthCount > 0);

  return <div className="ig ig-voice">
    {!storageReady && <p className="ig-warn" role="alert">Storage sozlanmagan — “Ovoz yasash” fayl saqlay olmaydi (sinab eshitish ishlaydi).</p>}
    {usage.warning && <p className="ig-warn" role="alert">⚠️ {usage.warning}</p>}
    <section className="bk-card ig-voice-usage" aria-label="Bu oy / So‘rovlar">
      {lines.map(item => <UsageLine key={item.id} item={item} limitUsd={item.credits ? null : usage.limits.monthlyUsd}/>)}
      <p className="bk-muted ig-voice-note">Bugun jami {usage.todayCount}{usage.limits.dailyWarn !== null ? ` / ${usage.limits.dailyWarn}` : ""} so‘rov · $ limiti OpenAI / ElevenLabs uchun; VoiceLab kreditda (asos: VOICELAB_MONTHLY_CREDITS).</p>
    </section>

    <section className="bk-card ig-voice-form" aria-labelledby="voice-form">
      <div className="bk-card-head"><div><h2 id="voice-form">Ssenariy</h2><p className="bk-muted">Uzun matn gaplar bo‘yicha bo‘linib, ketma-ket yasaladi va bitta faylga birlashtiriladi.</p></div></div>
      <label className="bk-field ig-voice-text"><span>Matn</span>
        <textarea value={text} onChange={event => setText(event.target.value)} rows={8} maxLength={20_000} placeholder="Assalomu alaykum! Bugun sizga yangi sovutish agregatini ko‘rsatamiz…"/>
        <small className="bk-muted">{text.length} / 20 000 belgi{chunks > 1 ? ` · ${chunks} qismga bo‘linadi` : ""}{provider?.configured && text.trim() ? ` · ≈ ${usd(text.trim().length * provider.usdPer1k / 1000)}` : ""}</small>
      </label>
      <div className="ig-voice-grid">
        <label className="bk-field"><span>Til</span>
          <select value={lang} onChange={event => pickLang(event.target.value)}>
            {languages.map(code => <option key={code} value={code}>{languageName(code)} ({code})</option>)}
          </select>
        </label>
        <label className="bk-field"><span>Provayder</span>
          <select value={providerId} onChange={event => pickProvider(event.target.value)}>
            {choices.map(item => <option key={item.id} value={item.id} disabled={!item.configured}>{item.name}{item.configured ? ` · ${item.model}` : ` — ${item.status}`}</option>)}
          </select>
        </label>
        <label className="bk-field"><span>Ovoz</span>
          <select value={voiceId} onChange={event => setVoiceId(event.target.value)} disabled={!voices.length}>
            {voices.map(voice => <option key={voice.id} value={voice.id}>{voice.name}{voice.gender ? ` (${voice.gender === "female" ? "ayol" : voice.gender === "male" ? "erkak" : "neytral"})` : ""}{voice.note ? ` · ${voice.note}` : ""}</option>)}
          </select>
        </label>
        <label className="bk-field"><span>Tezlik: {speedWorks ? `${speed.toFixed(2)}×` : "standart"}</span>
          <input type="range" min={speedRange.min} max={speedRange.max} step={0.05} value={speedWorks ? speed : 1} disabled={!speedWorks} onChange={event => setSpeed(Number(event.target.value))}/>
        </label>
        {provider && provider.formats.length > 1 && <label className="bk-field"><span>Format</span>
          <select value={format} onChange={event => setFormat(event.target.value)}>{provider.formats.map(item => <option key={item} value={item}>{item.toUpperCase()}</option>)}</select>
        </label>}
      </div>
      {provider && !provider.configured && <p className="ig-warn">{provider.name}: {provider.status}. Kalitni Vercel env’ga qo‘shing.</p>}
      {providers.filter(item => !item.configured).length > 0 && provider?.configured && <p className="bk-muted ig-voice-note">Ulanmagan: {providers.filter(item => !item.configured).map(item => `${item.name} (${item.envKey})`).join(", ")}</p>}
      <div className="ig-voice-actions">
        <button type="button" className="bk-btn" disabled={!ready || !!busy} onClick={() => void run("preview")}><BusyLabel busy={busy === "preview"} busyText="Tayyorlanmoqda…"><Headphones size={15}/>Sinab eshitish ({PREVIEW_CHARS} belgi)</BusyLabel></button>
        <button type="button" className="bk-btn is-primary" disabled={!ready || !!busy || !storageReady} onClick={() => void run("full")}><BusyLabel busy={busy === "full"} busyText={chunks > 1 ? `Yasalmoqda (${chunks} qism)…` : "Yasalmoqda…"}><Mic size={15}/>Ovoz yasash</BusyLabel></button>
      </div>
      {error && <p className="ig-error" role="alert">{error}</p>}
      {preview && <Result result={preview} title="Namuna"/>}
      {full && <Result result={full} title="Tayyor ovoz"/>}
    </section>

    <section className="bk-card ig-voice-gallery" aria-labelledby="voice-gallery">
      <div className="bk-card-head"><div><h2 id="voice-gallery">Ovozlar galereyasi · {languageName(lang)}</h2><p className="bk-muted">{provider?.name ?? "—"}: {voices.length} ta ovoz bitta namuna jumlani ketma-ket o‘qiydi (bir marta yasalib, keyin keshdan).</p></div></div>
      <div className="ig-voice-actions">
        {galleryOn ? <button type="button" className="bk-btn" onClick={stop}><Square size={15}/>To‘xtatish</button>
          : <button type="button" className="bk-btn is-primary" disabled={!ready || !voices.length} onClick={() => void playGallery()}><Play size={15}/>Hammasini eshitish</button>}
      </div>
      <audio ref={galleryAudio} className="ig-voice-hidden" preload="none"/>
      <ul className="ig-voice-list">{voices.map(voice => {
        const entry = gallery[voice.id];
        return <li key={voice.id} className={entry?.state === "playing" ? "is-playing" : voice.id === voiceId ? "is-picked" : ""}>
          <div className="ig-voice-name"><b>{voice.name}</b><small className="bk-muted">{entry?.state === "loading" ? "yasalmoqda…" : entry?.state === "playing" ? "▶ eshitilmoqda" : entry?.state === "error" ? `⚠️ ${entry.error}` : voice.note ?? ""}</small></div>
          <div className="ig-voice-row-actions">
            {entry?.url && <button type="button" className="bk-icon-btn" aria-label={`${voice.name} — qayta eshitish`} disabled={galleryOn} onClick={() => void playOne(voice.id)}><Play size={15}/></button>}
            <button type="button" className="bk-btn" disabled={voice.id === voiceId} onClick={() => setVoiceId(voice.id)}>{voice.id === voiceId ? "Tanlangan" : "Tanlash"}</button>
          </div>
        </li>;
      })}</ul>
    </section>

    <section aria-labelledby="voice-history">
      <h2 id="voice-history" className="ig-story-h">Tarix · {history.length}</h2>
      {history.length ? <ul className="ig-voice-history">{history.map(row => <li key={row.id} className="bk-card">
        <p className="ig-voice-head"><span className={`ig-tag ig-provider is-${row.provider}`}>{BADGE[row.provider] ?? providerName(row.provider)}</span>{row.text}{row.chars > row.text.length ? "…" : ""}</p>
        <p className="bk-muted ig-voice-meta">{[languageName(row.lang), row.voice, dateTime(row.createdAt), formatDuration(row.durationMs), row.format.toUpperCase(), `${row.chars} belgi`, row.credits !== null ? creditText(row.credits, row.creditsExact) : `≈ ${usd(row.costUsd)}`, row.source === "api" ? "API" : null].filter(Boolean).join(" · ")}</p>
        {row.audioUrl && <audio src={row.audioUrl} controls preload="none" className="ig-voice-audio"/>}
        <div className="ig-voice-row-actions">
          {row.audioUrl && <button type="button" className="bk-btn" onClick={() => void download(row.audioUrl!, `bk-ovoz-${row.id.slice(-8)}.${row.format}`)}><Download size={15}/>Yuklab olish</button>}
          <button type="button" className="bk-btn" disabled={pending} onClick={() => remove(row.id)}><Trash2 size={15}/>O‘chirish</button>
        </div>
      </li>)}</ul> : <div className="bk-empty">Hali ovoz yasalmagan</div>}
    </section>

    <p className="bk-muted ig-voice-note">API: <code>POST /api/tts</code> va <code>GET /api/tts/voices</code> (Authorization: Bearer TTS_API_TOKEN){apiReady ? "" : " — TTS_API_TOKEN sozlanmagan, API yopiq"}.</p>
  </div>;
}
