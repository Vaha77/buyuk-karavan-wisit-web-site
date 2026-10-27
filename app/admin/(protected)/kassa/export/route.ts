import ExcelJS from "exceljs";
import { requireRole } from "@/lib/auth/require-admin";
import { dayKey, resolvePeriod } from "@/lib/dashboard/period";
import { getKassaEntries, getKassaLedger } from "@/lib/kassa/queries";
import { PAYMENTS } from "@/lib/kassa/rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Kassa Excel: the period's entries and the day-by-day balances of each currency. */
export async function GET(request: Request) {
  await requireRole("SUPER_ADMIN");
  const params = new URL(request.url).searchParams;
  const period = resolvePeriod({ range: "custom", from: params.get("from") ?? undefined, to: params.get("to") ?? undefined });
  const [entries, { days }] = await Promise.all([getKassaEntries(period.from, period.to, { limit: 50_000 }), getKassaLedger(period.from, period.to)]);
  const workbook = new ExcelJS.Workbook();
  const list = workbook.addWorksheet("Yozuvlar");
  list.columns = [{ header: "Sana", key: "date", width: 18 }, { header: "Turi", key: "type", width: 9 }, { header: "Kategoriya", key: "category", width: 20 }, { header: "To‘lov", key: "payment", width: 16 }, { header: "Izoh", key: "note", width: 50 }, { header: "Valyuta", key: "currency", width: 9 }, { header: "Summa", key: "amount", width: 16 }, { header: "Kiritgan", key: "by", width: 18 }, { header: "Tuzatilgan", key: "edited", width: 11 }];
  // Excel has no time zone: write the Tashkent wall-clock time.
  for (const entry of [...entries].reverse()) list.addRow({ date: new Date(entry.occurredAt.getTime() + 5 * 3_600_000), type: entry.type === "IN" ? "Kirim" : "Chiqim", category: entry.category.name, payment: PAYMENTS[entry.paymentType].slice(3), note: entry.note, currency: entry.currency, amount: entry.type === "IN" ? entry.amount : -entry.amount, by: entry.createdBy.name, edited: entry.logs.length ? "ha" : "" });
  list.getColumn("date").numFmt = "dd.mm.yyyy hh:mm";
  const ledger = workbook.addWorksheet("Kunlar");
  ledger.columns = [{ header: "Kun", key: "day", width: 12 }, ...["USD", "UZS"].flatMap(currency => [["start", "kun boshi"], ["in", "kirim"], ["out", "chiqim"], ["end", "kun oxiri"]].map(([key, label]) => ({ header: `${currency} ${label}`, key: `${currency}.${key}`, width: 16 })))];
  for (const day of days) ledger.addRow({ day: day.day.split("-").reverse().join("."), ...Object.fromEntries((["USD", "UZS"] as const).flatMap(currency => (["start", "in", "out", "end"] as const).map(key => [`${currency}.${key}`, day[currency][key]]))) });
  for (const sheet of [list, ledger]) { sheet.getRow(1).font = { bold: true }; sheet.views = [{ state: "frozen", ySplit: 1 }]; }
  list.getColumn("amount").numFmt = "#,##0.##";
  ledger.columns.slice(1).forEach(column => { column.numFmt = "#,##0.##"; });
  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer as ArrayBuffer), { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="kassa-${dayKey(period.from)}_${dayKey(new Date(period.to.getTime() - 1))}.xlsx"`, "cache-control": "private, no-store" } });
}
