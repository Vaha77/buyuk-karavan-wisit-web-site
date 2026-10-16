"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Camera, ExternalLink, Film, RefreshCw, Search, X } from "lucide-react";
import { runInstagramQueueAction, saveInstagramGeneralAction, saveMediaRuleAction } from "@/app/admin/(protected)/instagram/actions";
import { BusyLabel } from "@/components/admin/feedback";
import type { BoardMedia, InstagramBoard as Board } from "@/lib/instagram/queries";
import { COMMENT_KINDS, CONTACT_PLACEHOLDERS, DEFAULT_DAILY_REPLY_LIMIT, DEFAULT_DM_TEMPLATE, DEFAULT_GENERAL_REPLY, DEFAULT_KEYWORDS, DEFAULT_PUBLIC_REPLY_VARIANTS, DEFAULT_QUESTION_DM, DEFAULT_QUESTION_REPLY, KIND_LABELS, PLACEHOLDERS, SECOND_PLACEHOLDERS, type CommentKind } from "@/lib/instagram/constants";

type Result = { ok: true; message?: string } | { ok: false; error: string };
type Product = Board["products"][number];
const dateTime = (iso: string) => new Intl.DateTimeFormat("uz-UZ", { timeZone: "Asia/Tashkent", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const day = (iso: string) => new Intl.DateTimeFormat("uz-UZ", { timeZone: "Asia/Tashkent", day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));

function useSave() {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const save = (action: () => Promise<Result>) => startTransition(async () => {
    const result = await action();
    setMessage(result.ok ? { ok: true, text: result.message ?? "Saqlandi ✓" } : { ok: false, text: result.error });
  });
  const note = message && <span className={message.ok ? "ig-ok" : "ig-error"} role={message.ok ? "status" : "alert"}>{message.text}</span>;
  return { pending, save, note, clear: () => setMessage(null) };
}

/** Searchable product select (catalogue, archived products excluded). */
function ProductPicker({ products, value, onChange }: { products: Product[]; value: string | null; onChange: (id: string | null) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = products.find(item => item.id === value) ?? null;
  const matches = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return products.filter(item => words.every(word => `${item.name} ${item.model}`.toLowerCase().includes(word))).slice(0, 30);
  }, [products, query]);
  if (selected && !open) return <div className="ig-picked">
    <span><strong>{selected.name}</strong>{selected.model && <small> · {selected.model}</small>}{!selected.hasPrice && <em className="ig-tag is-bad">narx yo‘q</em>}{!selected.isVisible && <em className="ig-tag is-bad">saytda yashirin</em>}</span>
    <button type="button" className="bk-icon-btn" aria-label="Boshqa mahsulot" onClick={() => setOpen(true)}><Search size={15}/></button>
    <button type="button" className="bk-icon-btn" aria-label="Mahsulotni olib tashlash" onClick={() => onChange(null)}><X size={15}/></button>
  </div>;
  return <div className="ig-picker">
    <input value={query} autoFocus={open} onChange={event => { setQuery(event.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder="Mahsulot qidiring: nomi yoki modeli…" aria-label="Mahsulot qidirish"/>
    {open && <ul role="listbox">
      {matches.map(item => <li key={item.id}><button type="button" role="option" aria-selected={item.id === value} onClick={() => { onChange(item.id); setOpen(false); setQuery(""); }}>{item.name}{item.model && <small> · {item.model}</small>}{!item.hasPrice && <em className="ig-tag is-bad">narx yo‘q</em>}</button></li>)}
      {!matches.length && <li className="bk-muted">Topilmadi</li>}
      {selected && <li><button type="button" onClick={() => setOpen(false)}>Bekor qilish</button></li>}
    </ul>}
  </div>;
}

function MediaCard({ accountId, media, rule, stats, products, canEdit }: { accountId: string; media: BoardMedia; rule: Board["rules"][string] | undefined; stats: Board["stats"][string] | undefined; products: Product[]; canEdit: boolean }) {
  const [productId, setProductId] = useState<string | null>(rule?.productId ?? null);
  const [secondProductId, setSecondProductId] = useState<string | null>(rule?.secondProductId ?? null);
  const [isActive, setActive] = useState(rule?.isActive ?? true);
  const [keywords, setKeywords] = useState((rule?.keywords ?? DEFAULT_KEYWORDS).join(", "));
  const [dmTemplate, setTemplate] = useState(rule?.dmTemplate ?? DEFAULT_DM_TEMPLATE);
  const [publicReplyEnabled, setPublic] = useState(rule?.publicReplyEnabled ?? true);
  const [priceText, setPriceText] = useState(rule?.priceText ?? "");
  const [variants, setVariants] = useState((rule?.publicReplyVariants.length ? rule.publicReplyVariants : rule ? [rule.publicReplyText] : DEFAULT_PUBLIC_REPLY_VARIANTS).join("\n"));
  const [open, setOpen] = useState(false);
  const { pending, save, note, clear } = useSave();
  const change = <T,>(setter: (value: T) => void) => (value: T) => { setter(value); clear(); };
  const product = products.find(item => item.id === productId);
  const state = !rule ? "Sozlanmagan" : !rule.isActive ? "O‘chiq" : rule.productId ? "Faol" : rule.priceText ? "Narx matni" : "Mahsulot yo‘q";

  return <article className={`bk-card ig-media ${rule?.isActive && rule.productId ? "is-live" : ""}`}>
    <div className="ig-media-top">
      <a className="ig-thumb" href={media.permalink ?? undefined} target="_blank" rel="noreferrer" aria-label="Instagram’da ochish">
        {/* Instagram CDN URLs expire; next/image would cache them through the optimizer. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {media.thumbnail ? <img src={media.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer"/> : <span>{media.isReel ? <Film size={22}/> : <Camera size={22}/>}</span>}
        {media.isReel && <em className="ig-reel">Reels</em>}
      </a>
      <div className="ig-media-meta">
        <p className="ig-caption">{media.caption || <span className="bk-muted">Izohsiz</span>}</p>
        <p className="bk-muted">{media.postedAt ? day(media.postedAt) : "—"}{media.commentsCount !== null && ` · ${media.commentsCount} komment`}{!media.fromApi && " · eski post"}</p>
        <p className="ig-stats"><span>{stats?.comments ?? 0} komment</span><span>{stats?.sent ?? 0} javob</span><span>{stats?.leads ?? 0} lid</span>{!!stats?.failed && <span className="is-bad">{stats.failed} xato</span>}</p>
        <p><span className={`ig-tag ${state === "Faol" || state === "Narx matni" ? "is-ok" : ""}`}>{state}</span>{product && <span className="ig-product"> {product.name}</span>}</p>
      </div>
    </div>
    {canEdit && <button type="button" className="bk-btn" onClick={() => setOpen(value => !value)} aria-expanded={open}>{open ? "Yopish" : "Sozlash"}</button>}
    {canEdit && open && <form className="ig-rule" onSubmit={event => { event.preventDefault(); save(() => saveMediaRuleAction({ accountId, mediaId: media.id, priceText: productId ? "" : priceText, productId, secondProductId, isActive, keywords, dmTemplate, publicReplyEnabled, publicReplyText: variants.split("\n").map(item => item.trim()).find(Boolean) ?? "", publicReplyVariants: variants, permalink: media.permalink, caption: media.caption || null, postedAt: media.postedAt })); }}>
      <div className="bk-field"><span>Mahsulot</span><ProductPicker products={products} value={productId} onChange={change(setProductId)}/></div>
      {!productId && <label className="bk-field"><span>Narx matni <small className="bk-muted">(mahsulotsiz post: narx so‘ralsa shu Direct’ga ketadi; bo‘sh — akkauntning “narx telefonda” matni; {CONTACT_PLACEHOLDERS.join(" ")})</small></span><textarea rows={3} value={priceText} onChange={event => change(setPriceText)(event.target.value)} placeholder="Masalan: Eshik narxi 2 500 000 so‘mdan. Batafsil: {telefon}" maxLength={900}/></label>}
      <div className="bk-field"><span>Qo‘shimcha mahsulot <small className="bk-muted">(ixtiyoriy; matnda {SECOND_PLACEHOLDERS.join(" ")} — yo‘q bo‘lsa shu qatorlar yuborilmaydi)</small></span><ProductPicker products={products.filter(item => item.id !== productId)} value={secondProductId} onChange={change(setSecondProductId)}/></div>
      <label className="ig-switch"><input type="checkbox" checked={isActive} onChange={event => change(setActive)(event.target.checked)}/><span>Avto-javoblar faol (shu post uchun barcha turlar)</span></label>
      <label className="bk-field"><span>Narx kalit so‘zlari <small className="bk-muted">(vergul bilan; “+” va “?” faqat komment shu belgilardan iborat bo‘lsa)</small></span><input value={keywords} onChange={event => change(setKeywords)(event.target.value)}/></label>
      <label className="bk-field"><span>Direct matni <small className="bk-muted">erkin matn; ixtiyoriy: {[...PLACEHOLDERS, ...SECOND_PLACEHOLDERS].join(" ")}</small></span><textarea rows={5} value={dmTemplate} onChange={event => change(setTemplate)(event.target.value)}/></label>
      <button type="button" className="ig-link-btn" onClick={() => change(setTemplate)(DEFAULT_DM_TEMPLATE)}>Standart matnni tiklash</button>
      <label className="ig-switch"><input type="checkbox" checked={publicReplyEnabled} onChange={event => change(setPublic)(event.target.checked)}/><span>Narx kommentiga ochiq javob</span></label>
      {publicReplyEnabled && <label className="bk-field"><span>Ochiq javob variantlari <small className="bk-muted">(har qatorda bittasi, tasodifiy tanlanadi)</small></span><textarea rows={3} value={variants} onChange={event => change(setVariants)(event.target.value)}/></label>}
      <div className="bk-actions"><button type="submit" className="bk-btn is-primary" disabled={pending}><BusyLabel busy={pending}>Saqlash</BusyLabel></button>{note}</div>
    </form>}
  </article>;
}

type Account = NonNullable<Board["account"]>;
const TOGGLES: Array<{ key: "priceEnabled" | "positiveEnabled" | "questionEnabled" | "negativeNotify"; label: string; hint: string }> = [
  { key: "priceEnabled", label: "Narx (PRICE)", hint: "Direct’ga post matni + ochiq javob" },
  { key: "positiveEnabled", label: "Ijobiy (POSITIVE)", hint: "AI qisqa minnatdorchilik yozadi" },
  { key: "questionEnabled", label: "Savol (QUESTION)", hint: "Ochiq javob + Direct + lid" },
  { key: "negativeNotify", label: "Salbiy → Telegram", hint: "Javob yo‘q, Super Admin’ga xabar" },
];

const CONTACT_TEMPLATES: Array<{ key: "phoneDmTemplate" | "addressDmTemplate" | "hoursDmTemplate"; label: string }> = [
  { key: "phoneDmTemplate", label: "Telefon so‘ralsa (Direct)" },
  { key: "addressDmTemplate", label: "Manzil so‘ralsa (Direct)" },
  { key: "hoursDmTemplate", label: "Ish vaqti so‘ralsa (Direct)" },
];

function GeneralSettings({ account, repliesToday }: { account: Account; repliesToday: number }) {
  const [form, setForm] = useState({ ...account, dailyReplyLimit: String(account.dailyReplyLimit), generalReplyText: account.generalReplyText || DEFAULT_GENERAL_REPLY, questionReplyText: account.questionReplyText || DEFAULT_QUESTION_REPLY, questionDmTemplate: account.questionDmTemplate || DEFAULT_QUESTION_DM });
  const { pending, save, note, clear } = useSave();
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => { setForm(current => ({ ...current, [key]: value })); clear(); };
  return <form className="bk-card ig-general" onSubmit={event => { event.preventDefault(); save(() => saveInstagramGeneralAction({ accountId: account.id, label: form.label, brandName: form.brandName, address: form.address, landmark: form.landmark, mapLink: form.mapLink, workHours: form.workHours, contactRepliesEnabled: form.contactRepliesEnabled, phoneDmTemplate: form.phoneDmTemplate, addressDmTemplate: form.addressDmTemplate, hoursDmTemplate: form.hoursDmTemplate, noPriceDmTemplate: form.noPriceDmTemplate, directChatId: form.directChatId, negativeChatId: form.negativeChatId, aiReplyAll: form.aiReplyAll, aiPrompt: form.aiPrompt, leadsEnabled: form.leadsEnabled, directEnabled: form.directEnabled, generalReplyEnabled: form.generalReplyEnabled, generalReplyText: form.generalReplyText, phone: form.phone, priceEnabled: form.priceEnabled, positiveEnabled: form.positiveEnabled, questionEnabled: form.questionEnabled, negativeNotify: form.negativeNotify, dailyReplyLimit: Number(form.dailyReplyLimit) || DEFAULT_DAILY_REPLY_LIMIT, questionReplyText: form.questionReplyText, questionDmTemplate: form.questionDmTemplate })); }}>
    <div><h2>Avto-javob sozlamalari</h2><p className="bk-muted">Javoblar orasida tasodifiy 8–25 soniya. Bir odamga bir postda faqat 1 javob; o‘z kommentlarimiz va javob-kommentlarga (reply) javob berilmaydi.</p></div>
    <div className="ig-toggles">{TOGGLES.map(item => <label key={item.key} className="ig-switch"><input type="checkbox" checked={form[item.key]} onChange={event => set(item.key, event.target.checked)}/><span>{item.label}<small className="bk-muted"> — {item.hint}</small></span></label>)}</div>
    <label className="bk-field" style={{ maxWidth: 240 }}><span>Kunlik ochiq javob limiti <small className="bk-muted">(bugun: {repliesToday})</small></span><input value={form.dailyReplyLimit} onChange={event => set("dailyReplyLimit", event.target.value.replace(/\D+/g, ""))} inputMode="numeric"/></label>
    {form.questionEnabled && <>
      <label className="bk-field"><span>Savolga ochiq javob</span><input value={form.questionReplyText} onChange={event => set("questionReplyText", event.target.value)} maxLength={300}/></label>
      <label className="bk-field"><span>Savolga Direct matni <small className="bk-muted">(mahsulotli postda post matni ketadi; bu yerda {"{telefon}"} {"{username}"})</small></span><textarea rows={3} value={form.questionDmTemplate} onChange={event => set("questionDmTemplate", event.target.value)}/></label>
    </>}
    <label className="bk-field"><span>Mahsulotsiz postdagi narx kommentiga Direct <small className="bk-muted">(post uchun narx matni yozilmagan bo‘lsa; bo‘sh — quyidagi umumiy javob yoki javobsiz)</small></span><textarea rows={2} value={form.noPriceDmTemplate} onChange={event => set("noPriceDmTemplate", event.target.value)} placeholder="Assalomu alaykum! Narxni telefon orqali aytamiz: {telefon}" maxLength={900}/></label>
    <label className="ig-switch"><input type="checkbox" checked={form.generalReplyEnabled} onChange={event => set("generalReplyEnabled", event.target.checked)}/><span>Mahsulotsiz postdagi narx kommentiga umumiy javob</span></label>
    {form.generalReplyEnabled && <label className="bk-field"><span>Umumiy javob matni</span><input value={form.generalReplyText} onChange={event => set("generalReplyText", event.target.value)} maxLength={300}/></label>}
    <label className="ig-switch"><input type="checkbox" checked={form.aiReplyAll} onChange={event => set("aiReplyAll", event.target.checked)}/><span>AI har kommentga javob yozadi<small className="bk-muted"> — spam, salbiy, narx/aloqa savollaridan tashqari (1–2 gap)</small></span></label>
    <label className="bk-field"><span>AI prompti <small className="bk-muted">(bo‘sh — standart; JSON {"{\"reply\": \"...\"}"} qaytarsin)</small></span><textarea rows={5} value={form.aiPrompt} onChange={event => set("aiPrompt", event.target.value)} maxLength={4000}/></label>
    <label className="ig-switch"><input type="checkbox" checked={form.leadsEnabled} onChange={event => set("leadsEnabled", event.target.checked)}/><span>Lidlar (Mijoz so‘rovlari)</span></label>
    <label className="ig-switch"><input type="checkbox" checked={form.directEnabled} onChange={event => set("directEnabled", event.target.checked)}/><span>Direct → Telegram (yozishmalar, kartalar)</span></label>
    <h3>Akkaunt va aloqa</h3>
    <div className="bk-actions">
      <label className="bk-field"><span>Nomi (admin, Telegram)</span><input value={form.label} onChange={event => set("label", event.target.value)} placeholder={`@${account.username}`} maxLength={80}/></label>
      <label className="bk-field"><span>Brend (AI shu nomdan yozadi)</span><input value={form.brandName} onChange={event => set("brandName", event.target.value)} placeholder={`@${account.username}`} maxLength={160}/></label>
    </div>
    <label className="bk-field"><span>Telefon {"{telefon}"} <small className="bk-muted">{account.id === "global" ? "(bo‘sh — sayt pastidagi raqam)" : "(bo‘sh — raqamsiz)"}</small></span><input value={form.phone} onChange={event => set("phone", event.target.value)} placeholder="+998 …" maxLength={40}/></label>
    <div className="bk-actions">
      <label className="bk-field"><span>Manzil {"{manzil}"}</span><input value={form.address} onChange={event => set("address", event.target.value)} maxLength={300}/></label>
      <label className="bk-field"><span>Mo‘ljal {"{moljal}"}</span><input value={form.landmark} onChange={event => set("landmark", event.target.value)} maxLength={300}/></label>
    </div>
    <div className="bk-actions">
      <label className="bk-field"><span>Xarita havolasi {"{xarita}"}</span><input value={form.mapLink} onChange={event => set("mapLink", event.target.value)} placeholder="https://yandex.uz/maps/…" maxLength={500}/></label>
      <label className="bk-field"><span>Ish vaqti {"{ishVaqti}"}</span><input value={form.workHours} onChange={event => set("workHours", event.target.value)} placeholder="Du–Sh 9:00–19:00" maxLength={200}/></label>
    </div>
    <label className="ig-switch"><input type="checkbox" checked={form.contactRepliesEnabled} onChange={event => set("contactRepliesEnabled", event.target.checked)}/><span>Telefon / manzil / ish vaqti savollari<small className="bk-muted"> — Direct’ga shablon + savolga ochiq javob</small></span></label>
    {form.contactRepliesEnabled && CONTACT_TEMPLATES.map(item => <label key={item.key} className="bk-field"><span>{item.label} <small className="bk-muted">{CONTACT_PLACEHOLDERS.join(" ")} {"{username}"}</small></span><textarea rows={2} value={form[item.key]} onChange={event => set(item.key, event.target.value)} maxLength={900}/></label>)}
    <div className="bk-actions">
      <label className="bk-field"><span>Direct → Telegram guruh ID <small className="bk-muted">(bo‘sh — “Instagram so‘rovlarini oladi” adminlari)</small></span><input value={form.directChatId} onChange={event => set("directChatId", event.target.value.trim())} placeholder="-100…" maxLength={21}/></label>
      <label className="bk-field"><span>Salbiy kommentlar guruhi ID <small className="bk-muted">(Super Admin’larga ham boradi)</small></span><input value={form.negativeChatId} onChange={event => set("negativeChatId", event.target.value.trim())} placeholder="-100…" maxLength={21}/></label>
    </div>
    <div className="bk-actions"><button type="submit" className="bk-btn is-primary" disabled={pending}><BusyLabel busy={pending}>Saqlash</BusyLabel></button>{note}</div>
  </form>;
}

const STATUS: Record<string, { label: string; className: string }> = { SENT: { label: "Yuborildi", className: "is-ok" }, FAILED: { label: "Xato", className: "is-bad" }, SKIPPED: { label: "O‘tkazildi", className: "" }, PENDING: { label: "Navbatda", className: "is-wait" }, NOTIFIED: { label: "Adminga", className: "is-bad" } };
const KIND_CLASS: Record<string, string> = { PRICE: "is-ok", POSITIVE: "is-ok", QUESTION: "is-wait", NEGATIVE: "is-bad", SPAM: "", UNKNOWN: "", PHONE: "is-wait", ADDRESS: "is-wait", HOURS: "is-wait" };
const usd = (value: number) => `$${value < 0.01 ? value.toFixed(5) : value.toFixed(2)}`;

function KindStats({ board }: { board: Board }) {
  return <section className="bk-card ig-kinds" aria-label="Turlar bo‘yicha">
    {COMMENT_KINDS.map(kind => <div key={kind}><span className={`ig-tag ${KIND_CLASS[kind]}`}>{KIND_LABELS[kind]}</span><strong>{board.kinds[kind] ?? 0}</strong></div>)}
    <div><span className="ig-tag">AI xarajati</span><strong>{usd(board.aiCostUsd)}</strong><small className="bk-muted">{board.aiTokens.toLocaleString("en-US")} token</small></div>
  </section>;
}

function Journal({ rows, accountId }: { rows: Board["journal"]; accountId: string }) {
  const [filter, setFilter] = useState<string>("ALL");
  const counts = rows.reduce<Record<string, number>>((all, row) => ({ ...all, [row.status]: (all[row.status] ?? 0) + 1, ...(row.kind ? { [row.kind]: (all[row.kind] ?? 0) + 1 } : {}) }), {});
  const shown = filter === "ALL" ? rows : rows.filter(row => row.status === filter || row.kind === filter);
  const { pending, save, note } = useSave();
  const filters = ["ALL", "SENT", "NOTIFIED", "FAILED", "SKIPPED", "PENDING", ...COMMENT_KINDS];
  return <section className="bk-card" aria-labelledby="ig-journal">
    <div className="bk-card-head"><div><h2 id="ig-journal">Jurnal</h2><p className="bk-muted">Oxirgi 150 komment · lidlar “Mijoz so‘rovlari”da (manba: Instagram)</p></div>
      <div className="bk-actions">{!!counts.PENDING && <button type="button" className="bk-btn" disabled={pending} onClick={() => save(() => runInstagramQueueAction(accountId))}><RefreshCw size={14}/><BusyLabel busy={pending} busyText="Yuborilmoqda…">Navbatni hozir yuborish</BusyLabel></button>}{note}</div>
    </div>
    <div className="bk-chips" role="tablist">{filters.map(key => <button key={key} type="button" role="tab" className="bk-chip" aria-selected={filter === key} onClick={() => setFilter(key)}>{key === "ALL" ? "Hammasi" : STATUS[key]?.label ?? KIND_LABELS[key as CommentKind]}<small>{key === "ALL" ? rows.length : counts[key] ?? 0}</small></button>)}</div>
    {shown.length ? <div className="bk-table-wrap"><table className="bk-table ig-table"><thead><tr><th>Sana</th><th className="is-left">Kim</th><th className="is-left">Komment</th><th className="is-left">Tur</th><th className="is-left">Javob</th><th className="is-left">Holat</th><th>AI</th></tr></thead><tbody>
      {shown.map(row => <tr key={row.commentId}>
        <td>{dateTime(row.createdAt)}</td>
        <td className="is-left">{row.username ? <a href={`https://instagram.com/${row.username}`} target="_blank" rel="noreferrer">@{row.username}</a> : "—"}</td>
        <td className="is-left ig-wrap">{row.text || "—"}{row.permalink && <a className="ig-ext" href={row.permalink} target="_blank" rel="noreferrer" aria-label="Post"><ExternalLink size={12}/></a>}{row.productName && <small className="ig-reason">{row.productName}</small>}</td>
        <td className="is-left">{row.kind ? <span className={`ig-tag ${KIND_CLASS[row.kind]}`} title={row.classifiedBy ?? ""}>{KIND_LABELS[row.kind as CommentKind]}</span> : "—"}</td>
        <td className="is-left ig-wrap">{row.publicReplyText && <small className="ig-reply">💬 {row.publicReplyText}</small>}{row.dmText && <small className="ig-reply" title={row.dmText}>📩 {row.dmText.length > 90 ? `${row.dmText.slice(0, 90)}…` : row.dmText}</small>}{!row.publicReplyText && !row.dmText && "—"}</td>
        <td className="is-left ig-wrap"><span className={`ig-tag ${STATUS[row.status].className}`}>{STATUS[row.status].label}</span>{row.leadId && <span className="ig-tag is-ok">lid</span>}{row.reviewedAt && <span className="ig-tag is-ok">ko‘rildi{row.reviewedBy ? `: ${row.reviewedBy}` : ""}</span>}{row.reason && <small className="ig-reason">{row.reason}</small>}{row.publicReplyError && <small className="ig-reason">Ochiq javob: {row.publicReplyError}</small>}</td>
        <td>{row.aiCostUsd ? usd(row.aiCostUsd) : row.classifiedBy === "AI" ? "$0" : "—"}</td>
      </tr>)}
    </tbody></table></div> : <div className="bk-empty">Hali yozuv yo‘q</div>}
  </section>;
}

export function InstagramBoard({ board, canConnect }: { board: Board; canConnect: boolean }) {
  const [query, setQuery] = useState("");
  const media = board.media.filter(item => !query || item.caption.toLowerCase().includes(query.toLowerCase()));
  if (!board.account) return <div className="bk-empty"><strong>Instagram ulanmagan</strong><span>{canConnect ? <Link href="/admin/settings#instagram">Sozlamalar → Instagram</Link> : "Super Admin Sozlamalarda ulashi kerak."}</span></div>;
  const accountId = board.account.id;
  return <div className="ig">
    <div className="bk-grid-main">
      <section className="bk-card ig-summary"><h2>@{board.account.username}</h2><p className="bk-muted">Har komment avval kalit so‘z bilan, noaniq bo‘lsa Madina AI bilan turlanadi: Narx → Direct + ochiq javob; Ijobiy → qisqa rahmat; Savol → ochiq javob + Direct + lid; Salbiy → javobsiz, Telegram’da Super Admin’ga; Spam → javobsiz. Narx Prays’dan jonli, CBU kursi bo‘yicha.</p>{board.mediaError && <p className="ig-error" role="alert">{board.mediaError}</p>}</section>
      <GeneralSettings account={board.account} repliesToday={board.repliesToday}/>
    </div>
    <KindStats board={board}/>
    <div className="ig-toolbar"><h2>Postlar va Reels</h2><label className="ig-search"><Search size={15}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Izoh bo‘yicha qidirish" aria-label="Postlarni qidirish"/></label></div>
    {media.length ? <div className="ig-grid">{media.map(item => <MediaCard key={item.id} accountId={accountId} media={item} rule={board.rules[item.id]} stats={board.stats[item.id]} products={board.products} canEdit/>)}</div> : <div className="bk-empty">Post topilmadi</div>}
    <Journal rows={board.journal} accountId={accountId}/>
  </div>;
}
