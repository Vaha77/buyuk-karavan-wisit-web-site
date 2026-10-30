"use client";
import { useTransition } from "react";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Check, Pencil, X } from "lucide-react";
import { Pill } from "@/components/ui/aurora";
import { cancelDraftAction, confirmAllDraftsAction, confirmDraftAction } from "@/app/admin/(protected)/kassa/actions";

export type DraftRow = { id: string; note: string; voice: boolean; meta: string; amount: string; isIn: boolean | null; warning: string | null; editHref: string; employee: string | null };

/** "Botdan kelganlar · N ta kutmoqda": ✓ / ✏️ / ✕ per draft; a flagged (yellow) draft is fixed with ✏️ before ✓. */
export function KassaBotDrafts({ drafts }: { drafts: DraftRow[] }) {
  const [pending, start] = useTransition();
  const ready = drafts.filter(draft => !draft.warning).length;
  const run = (action: () => Promise<unknown>) => start(async () => { await action(); });
  return <section className="glass kassa-drafts" aria-label="Botdan kelganlar">
    <h2>Botdan kelganlar <span>{drafts.length} ta kutmoqda</span></h2>
    {drafts.map(draft => <div key={draft.id} className={`kassa-draft${draft.warning ? " is-warn" : ""}`}>
      <i className={draft.isIn ? "ic-in" : "ic-out"}>{draft.isIn ? <ArrowDownLeft size={16}/> : <ArrowUpRight size={16}/>}</i>
      <div><b>{draft.note}</b> <small>{draft.voice ? "🎙 ovoz" : "✍️ matn"}</small>{draft.employee && <Pill tone="info">👤 {draft.employee}?</Pill>}<span>{draft.warning ? `⚠ ${draft.warning} — tekshiring` : draft.meta}</span></div>
      <strong className={draft.isIn ? "amt-in" : "amt-out"}>{draft.amount}</strong>
      <div className="kassa-draft-actions">
        <button type="button" aria-label="Tasdiqlash" disabled={pending || !!draft.warning} onClick={() => run(() => confirmDraftAction(draft.id))}><Check size={16}/></button>
        <Link href={draft.editHref} scroll={false} aria-label="Tuzatish"><Pencil size={15}/></Link>
        <button type="button" aria-label="Bekor qilish" disabled={pending} onClick={() => run(() => cancelDraftAction(draft.id))}><X size={16}/></button>
      </div>
    </div>)}
    {ready > 0 && <button type="button" className="btn-g kassa-confirm-all" disabled={pending} onClick={() => run(confirmAllDraftsAction)}><Check size={16}/>Hammasini tasdiqlash ({ready} ta)</button>}
  </section>;
}
