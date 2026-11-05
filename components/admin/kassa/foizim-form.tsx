"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, UserRound } from "lucide-react";
import { deleteCommissionAction, saveCommissionAction, saveShortageAction } from "@/app/admin/(protected)/kassa/foizim/actions";
import { KINDS, percentOf, type Kind } from "@/lib/foizim/rules";
import { money, parseAmount, round } from "@/lib/kassa/rules";
import { DeleteEntryButton } from "./delete-entry";
import { groupDigits, nowLocal, toLocal } from "./entry-form";
import { Sheet, useSave } from "./hodim-forms";

type Entry = { id: string; kind: Kind; sellerId: string | null; storekeeperId: string | null; salaryMonth: string | null; category: string | null; fromName: string; amount: number; base: number | null; percent: number | null; note: string | null; occurredAt: string };
type Person = { id: string; name: string; hint?: string };

/** Kassa's hodim select (same classes): search, pick, the hint on the right. */
function PersonPicker({ people, value, onPick, placeholder }: { people: Person[]; value: string; onPick: (id: string) => void; placeholder: string }) {
  const [open, setOpen] = useState(false), [search, setSearch] = useState(""), picked = people.find(item => item.id === value);
  const list = people.filter(item => item.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const pick = (id: string) => { onPick(id); setOpen(false); setSearch(""); };
  return <div className="hodim-select" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button type="button" className="hodim-select-hd" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(item => !item)}><UserRound size={18}/>{picked?.name ?? placeholder}<ChevronDown size={16}/></button>
    {open && <div className="hodim-select-open">
      <input autoFocus type="search" aria-label="Qidirish" placeholder="🔍 Qidirish…" autoComplete="off" value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && list[0]) { event.preventDefault(); pick(list[0].id); } if (event.key === "Escape") setOpen(false); }}/>
      <div role="listbox" aria-label={placeholder}>{list.map(item => <button key={item.id} type="button" role="option" aria-selected={item.id === value} onMouseDown={event => event.preventDefault()} onClick={() => pick(item.id)}><i>{item.name.charAt(0).toUpperCase()}</i>{item.name}<b>{item.hint ?? "—"}</b></button>)}</div>
    </div>}
  </div>;
}

const thisMonth = () => nowLocal().slice(0, 7);

/** "＋ Yangi yozuv" / correction: Kirim (sotuvchidan foiz · boshqa) or Chiqim (skladchi oyligi · boshqa). Summa can always be typed over. */
export function CommissionSheet({ entry, names, categories, notes, sellers, keepers, salaries, closeHref }: { entry?: Entry; names: string[]; categories: string[]; notes: string[]; sellers: Array<Person & { percent?: number }>; keepers: Array<Person & { salary?: number }>; salaries: Array<{ id: string; storekeeperId: string; salaryMonth: string }>; closeHref: string }) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>(entry?.kind ?? "SELLER_COMMISSION"), direction = KINDS[kind].direction;
  const [fromName, setFromName] = useState(entry?.kind === "OTHER_IN" ? entry.fromName : "");
  const [sellerId, setSellerId] = useState(entry?.sellerId ?? ""), [storekeeperId, setStorekeeperId] = useState(entry?.storekeeperId ?? "");
  const [salaryMonth, setSalaryMonth] = useState(entry?.salaryMonth ?? thisMonth()), [category, setCategory] = useState(entry?.category ?? ""), [newCategory, setNewCategory] = useState(false);
  const [calc, setCalc] = useState(entry ? entry.base != null : true);
  const [base, setBase] = useState(entry?.base != null ? groupDigits(String(entry.base)) : "");
  const [percent, setPercent] = useState(entry?.percent != null ? String(entry.percent) : "");
  const [amount, setAmount] = useState(entry ? groupDigits(String(entry.amount)) : "");
  const [when, setWhen] = useState(() => entry ? toLocal(entry.occurredAt) : nowLocal());
  const { error, pending, submit } = useSave(saveCommissionAction, () => router.replace(closeHref, { scroll: false }));
  // A delete from this sheet (phone: rows have no 🗑) closes it; the page's toast offers "Qaytarish".
  useEffect(() => { const close = () => router.replace(closeHref, { scroll: false }); window.addEventListener("kassa:deleted", close); return () => window.removeEventListener("kassa:deleted", close); }, [router, closeHref]);
  const computed = percentOf(parseAmount(base), parseAmount(percent));
  const fill = (nextBase: string, nextPercent: string) => { const value = percentOf(parseAmount(nextBase), parseAmount(nextPercent)); if (value > 0) setAmount(groupDigits(String(value))); };
  const pickSeller = (id: string) => { setSellerId(id); const usual = sellers.find(item => item.id === id)?.percent; if (usual != null && !percent) { setPercent(String(usual)); fill(base, String(usual)); } };
  const pickKeeper = (id: string) => { setStorekeeperId(id); const last = keepers.find(item => item.id === id)?.salary; if (last != null && !amount) setAmount(groupDigits(String(last))); };
  const keeper = keepers.find(item => item.id === storekeeperId), taken = keeper && salaries.some(row => row.storekeeperId === keeper.id && row.salaryMonth === salaryMonth && row.id !== entry?.id);
  const kinds = (Object.keys(KINDS) as Kind[]).filter(item => KINDS[item].direction === direction);
  return <Sheet title={entry ? "Yozuvni tuzatish" : "＋ Yangi yozuv"} closeHref={closeHref}>
    <form action={submit} className="hodim-fields">
      {entry && <input type="hidden" name="id" value={entry.id}/>}
      <input type="hidden" name="kind" value={kind}/><input type="hidden" name="sellerId" value={sellerId}/><input type="hidden" name="storekeeperId" value={storekeeperId}/><input type="hidden" name="category" value={category}/>
      <div className="kassa-io foizim-io" role="group" aria-label="Turi">
        <button type="button" className={direction === "IN" ? "is-in" : undefined} aria-pressed={direction === "IN"} onClick={() => { setKind("SELLER_COMMISSION"); if (!entry) setCalc(true); }}>↓ Kirim</button>
        <button type="button" className={direction === "OUT" ? "is-out" : undefined} aria-pressed={direction === "OUT"} onClick={() => setKind("SALARY")}>↑ Chiqim</button>
      </div>
      <p className="kassa-label">{direction === "IN" ? "Qayerdan?" : "Nimaga?"}</p>
      <div className="kassa-chips">{kinds.map(item => <button key={item} type="button" className={`chip${kind === item ? " on" : ""}`} aria-pressed={kind === item} onClick={() => { setKind(item); if (!entry) setCalc(item === "SELLER_COMMISSION"); }}>{KINDS[item].label}</button>)}</div>
      {kind === "SELLER_COMMISSION" && <><p className="kassa-label">Sotuvchi *</p><PersonPicker people={sellers.map(item => ({ ...item, hint: item.percent != null ? `odatda ${item.percent}%` : undefined }))} value={sellerId} onPick={pickSeller} placeholder="Sotuvchini tanlang"/></>}
      {kind === "SALARY" && <><p className="kassa-label">Skladchi *</p><PersonPicker people={keepers.map(item => ({ ...item, hint: item.salary != null ? `oxirgi ${money(item.salary, "USD")}` : undefined }))} value={storekeeperId} onPick={pickKeeper} placeholder="Skladchini tanlang"/></>}
      {kind === "OTHER_IN" && <>
        <label>Kimdan *<input name="fromName" maxLength={100} autoComplete="off" value={fromName} onChange={event => setFromName(event.target.value)} required/></label>
        {names.length > 0 && <div className="foizim-sug">{names.map(name => <button key={name} type="button" className={`chip${name === fromName.trim() ? " on" : ""}`} onClick={() => setFromName(name)}>{name}</button>)}</div>}
      </>}
      {kind === "OTHER_OUT" && <div className="kassa-chips">
        {categories.map(name => <button key={name} type="button" className={`chip${category === name ? " on" : ""}`} aria-pressed={category === name} onClick={() => { setCategory(name); setNewCategory(false); }}>{name}</button>)}
        {newCategory || (category && !categories.includes(category))
          ? <span className="kassa-newcat"><input autoFocus maxLength={60} placeholder="Kategoriya nomi" aria-label="Kategoriya" value={category} onChange={event => setCategory(event.target.value)}/></span>
          : <button type="button" className="chip dash kassa-new" onClick={() => { setCategory(""); setNewCategory(true); }}>+ Yangi</button>}
      </div>}
      {direction === "IN" && <>
        <label className="hodim-check"><input type="checkbox" name="calc" checked={calc} onChange={event => setCalc(event.target.checked)}/>Foizdan hisoblash</label>
        {calc && <>
          <div className="foizim-g2">
            <label>Savdo, $<input name="base" inputMode="decimal" autoComplete="off" placeholder="0" value={base} onChange={event => { const next = groupDigits(event.target.value); setBase(next); fill(next, percent); }} required/></label>
            <label>Foiz, %<input name="percent" inputMode="decimal" autoComplete="off" placeholder="5" value={percent} onChange={event => { const next = event.target.value.replace(/[^\d.,]/g, "").replace(",", "."); setPercent(next); fill(base, next); }} required/></label>
          </div>
          {computed > 0 && <p className="foizim-calc">{money(parseAmount(base), "USD")} × {parseAmount(percent)}% = <b>{money(computed, "USD")}</b></p>}
        </>}
      </>}
      <label>Summa, $<input name="amount" inputMode="decimal" autoComplete="off" placeholder="0" value={amount} onChange={event => setAmount(groupDigits(event.target.value))} required/></label>
      {kind === "SALARY" && <>
        <label>Qaysi oy uchun<input type="month" name="salaryMonth" value={salaryMonth} onChange={event => setSalaryMonth(event.target.value)} required/></label>
        {keeper && <p className={taken ? "kassa-error" : "foizim-calc"} role={taken ? "alert" : undefined}>{taken ? `Diqqat: ${keeper.name}ga bu oy uchun oylik allaqachon yozilgan.` : `Bu oy ${keeper.name}ga hali oylik yozilmagan ✓`}</p>}
      </>}
      <label>Sana<input type="datetime-local" name="occurredAt" value={when} onChange={event => setWhen(event.target.value)} required/></label>
      <label>Izoh<input name="note" list="foizim-notes" maxLength={300} autoComplete="off" defaultValue={entry?.note ?? ""} placeholder="Masalan: Sovutish ombori"/></label>
      <datalist id="foizim-notes">{notes.map(note => <option key={note} value={note}/>)}</datalist>
      {error && <p className="kassa-error" role="alert">{error}</p>}
      <div className="hodim-save"><button className="btn-g" disabled={pending}>{pending ? "Saqlanmoqda…" : "Saqlash"}</button>{entry && <DeleteEntryButton ghost id={entry.id} label={`${money(entry.amount, "USD")} · ${entry.fromName}`} action={deleteCommissionAction}/>}</div>
    </form>
  </Sheet>;
}

/** "＋ Kamomat qo‘shish" (OPENING the first time) or a correction of a kamomat row; "Saqlangach: $A → $B". */
export function ShortageSheet({ entry, current, opening, adjust, closeHref }: { entry?: { id: string; type: "OPENING" | "ADD" | "ADJUST"; amount: number; note: string; occurredAt: string }; current: number; opening: boolean; adjust?: boolean; closeHref: string }) {
  const router = useRouter(), type = entry?.type ?? (opening ? "OPENING" : adjust ? "ADJUST" : "ADD");
  const [amount, setAmount] = useState(entry ? `${entry.amount < 0 ? "-" : ""}${groupDigits(String(Math.abs(entry.amount)))}` : "");
  const [when, setWhen] = useState(() => entry ? toLocal(entry.occurredAt) : nowLocal());
  const { error, pending, submit } = useSave(saveShortageAction, () => router.replace(closeHref, { scroll: false }));
  const typed = (/^[-−]/.test(amount) ? -1 : 1) * (parseAmount(amount.replace(/^[-−]/, "")) || 0), after = round(Math.max(0, current - (entry?.amount ?? 0) + typed));
  return <Sheet title={type === "OPENING" ? "Boshlang‘ich kamomat" : entry ? "Kamomatni tuzatish" : "＋ Kamomat qo‘shish"} closeHref={closeHref}>
    <form action={submit} className="hodim-fields">
      {entry && <input type="hidden" name="id" value={entry.id}/>}<input type="hidden" name="type" value={type}/>
      {!opening && <p className="foizim-calc">Hozirgi kamomat: <b>{money(current, "USD")}</b></p>}
      <label>Summa, ${type === "ADJUST" && " (minus bo‘lishi mumkin)"}<input name="amount" inputMode="decimal" autoComplete="off" placeholder="0" value={amount} onChange={event => setAmount(`${type === "ADJUST" && /^\s*[-−]/.test(event.target.value) ? "-" : ""}${groupDigits(event.target.value)}`)} required autoFocus/></label>
      <label>{type === "OPENING" ? "Izoh" : "Nima kam chiqdi?"}<input name="note" maxLength={300} autoComplete="off" defaultValue={entry?.note ?? (type === "OPENING" ? "Boshlang‘ich kamomat" : "")} placeholder="Reviziya: solenoid klapan F12 × 8" required/></label>
      <label>Sana<input type="datetime-local" name="occurredAt" value={when} onChange={event => setWhen(event.target.value)} required/></label>
      <p className="foizim-calc">Saqlangach kamomat: {money(current, "USD")} → <b>{money(after, "USD")}</b></p>
      {error && <p className="kassa-error" role="alert">{error}</p>}
      <div className="hodim-save"><button className="btn-g" disabled={pending}>{pending ? "Saqlanmoqda…" : type === "OPENING" ? "Saqlash" : entry ? "Tuzatishni saqlash" : "Kamomatga qo‘shish"}</button></div>
    </form>
  </Sheet>;
}
