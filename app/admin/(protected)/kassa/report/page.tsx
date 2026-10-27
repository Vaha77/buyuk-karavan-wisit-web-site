import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, Download } from "lucide-react";
import { Chip, ChipGroup, GhostButton, GlassCard, ProgressBar } from "@/components/ui/aurora";
import { requireRole } from "@/lib/auth/require-admin";
import { dayKey, resolvePeriod } from "@/lib/dashboard/period";
import { getKassaCategories, getKassaLedger } from "@/lib/kassa/queries";
import { CURRENCIES, money, totals, type Currency } from "@/lib/kassa/rules";
import "@/components/admin/kassa/kassa.css";

export const metadata: Metadata = { title: "Kassa hisoboti — Admin | BUYUK KARAVAN" };
type Search = { range?: string; from?: string; to?: string; cur?: string };

const PERIODS = [{ key: "today", label: "Bugun" }, { key: "7d", label: "Hafta" }, { key: "month", label: "Oy" }, { key: "90d", label: "90 kun" }, { key: "year", label: "Yil" }] as const;
const COLORS = ["#7c5cff", "#22d3ee", "#f59e0b", "#fb7185", "#34d399"];
const R = 44, L = 2 * Math.PI * R;

export default async function KassaReportPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireRole("SUPER_ADMIN");
  const search = await searchParams;
  const period = resolvePeriod({ ...search, range: search.range ?? "month" });
  const currency: Currency = search.cur === "UZS" ? "UZS" : "USD";
  const fromDay = dayKey(period.from), toDay = dayKey(new Date(period.to.getTime() - 1));
  const [{ days, rows }, categories] = await Promise.all([getKassaLedger(period.from, period.to), getKassaCategories()]);
  const query = (patch: Partial<Search>) => `?${new URLSearchParams(Object.entries({ ...search, ...patch }).filter((pair): pair is [string, string] => !!pair[1]))}`;
  const names = new Map(categories.map(category => [category.id, `${category.icon ?? ""} ${category.name}`.trim()]));
  const split = (type: "IN" | "OUT") => {
    const sums = new Map<string, number>();
    for (const row of rows) if (row.type === type && row.currency === currency) sums.set(row.categoryId, (sums.get(row.categoryId) ?? 0) + row.amount);
    return [...sums].map(([id, sum]) => ({ name: names.get(id) ?? "—", sum })).sort((a, b) => b.sum - a.sum);
  };
  const out = split("OUT"), income = split("IN");
  const outTotal = out.reduce((sum, item) => sum + item.sum, 0);
  // Donut: top 4 + "Boshqa", as in the maket.
  const slices = out.length > 5 ? [...out.slice(0, 4), { name: "Boshqa", sum: out.slice(4).reduce((sum, item) => sum + item.sum, 0) }] : out;
  const peak = Math.max(1, ...days.map(day => Math.max(day[currency].in, day[currency].out)));
  const starts = slices.map((_, index) => slices.slice(0, index).reduce((sum, item) => sum + item.sum, 0) / (outTotal || 1));

  return <div className="kassa">
    <header className="kassa-top">
      <div><p className="kassa-hi"><Link href={`/admin/kassa${query({ cur: undefined })}`}><ChevronLeft size={12}/> Kassa</Link> · {fromDay.split("-").reverse().join(".")} — {toDay.split("-").reverse().join(".")}</p><h1>Hisobot</h1></div>
      <div className="kassa-actions">
        <ChipGroup label="Davr">{PERIODS.map(item => <Chip key={item.key} href={query({ range: item.key, from: undefined, to: undefined })} on={period.key === item.key}>{item.label}</Chip>)}</ChipGroup>
        <form className="kassa-range"><input type="hidden" name="range" value="custom"/><input type="hidden" name="cur" value={currency}/><input type="date" name="from" defaultValue={fromDay} aria-label="Dan"/><span>—</span><input type="date" name="to" defaultValue={toDay} aria-label="Gacha"/><button className="chip">Davr</button></form>
        <GhostButton href={`/admin/kassa/export?from=${fromDay}&to=${toDay}`} prefetch={false}><Download size={16}/>Excel</GhostButton>
      </div>
    </header>

    <div className="kassa-balances">
      {CURRENCIES.map(item => {
        const sum = totals(days, item), diff = sum.in - sum.out;
        return <GlassCard key={item} blur className="kassa-bal">
          <span>{item === "USD" ? "Dollar" : "So‘m"} · farq (kirim − chiqim)</span>
          <b className={diff < 0 ? "is-neg" : undefined}>{money(diff, item, true)}</b>
          <dl><div><dt>Kirim</dt><dd className="amt-in">{money(sum.in, item, true)}</dd></div><div><dt>Chiqim</dt><dd className="amt-out">{money(-sum.out, item)}</dd></div><div><dt>Davr oxiri</dt><dd className={sum.end < 0 ? "is-neg" : undefined}>{money(sum.end, item)}</dd></div></dl>
        </GlassCard>;
      })}
    </div>

    <ChipGroup label="Valyuta" className="kassa-cur">{CURRENCIES.map(item => <Chip key={item} href={query({ cur: item })} on={currency === item}>{item === "USD" ? "$ dollar" : "so‘m"}</Chip>)}</ChipGroup>

    <div className="kassa-report">
      <GlassCard className="kassa-donut">
        <h2>Chiqim — nimaga ketdi</h2>
        {outTotal === 0 ? <p className="kassa-empty">Chiqim yo‘q.</p> : <div>
          <svg viewBox="0 0 120 120" role="img" aria-label="Chiqim kategoriyalar bo‘yicha"><circle cx="60" cy="60" r={R} stroke="rgba(255,255,255,.07)"/>
            {slices.map((slice, index) => <circle key={slice.name} cx="60" cy="60" r={R} stroke={COLORS[index]} strokeDasharray={`${Math.max(0, (L * slice.sum) / outTotal - 2)} ${L}`} strokeDashoffset={-L * starts[index]}/>)}
          </svg>
          <ul>{slices.map((slice, index) => <li key={slice.name}><i style={{ background: COLORS[index] }}/>{slice.name}<b>{Math.round((slice.sum / outTotal) * 100)}%</b><small>{money(slice.sum, currency)}</small></li>)}</ul>
        </div>}
      </GlassCard>
      <GlassCard className="kassa-bars">
        <h2>Kirim — qayerdan keldi</h2>
        {income.length === 0 ? <p className="kassa-empty">Kirim yo‘q.</p> : income.map(item => <div key={item.name}><p>{item.name}<span>{money(item.sum, currency)}</span></p><ProgressBar value={item.sum / income[0].sum}/></div>)}
      </GlassCard>
      <GlassCard className="kassa-daily">
        <h2>Kunlar bo‘yicha</h2>
        <div className="kassa-cols" role="img" aria-label="Kunlik kirim va chiqim">{days.map(day => <div key={day.day} title={`${day.day.split("-").reverse().join(".")}: ${money(day[currency].in, currency, true)} / ${money(-day[currency].out, currency)}`}><i style={{ height: `${(day[currency].in / peak) * 100}%` }} className="col-in"/><i style={{ height: `${(day[currency].out / peak) * 100}%` }} className="col-out"/></div>)}</div>
        <p className="kassa-legend"><span><i className="col-in"/> kirim</span><span><i className="col-out"/> chiqim</span></p>
      </GlassCard>
    </div>
  </div>;
}
