import ExcelJS from "exceljs";
import { requireRole } from "@/lib/auth/require-admin";
import { getCommissions } from "@/lib/foizim/queries";
import { commissionRange, inRange, sumOf } from "@/lib/foizim/rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Excel has no time zone: write the Tashkent wall-clock time.
const local = (date: Date) => new Date(date.getTime() + 5 * 3_600_000);

/** The page's period (?p=, from, to): one row per entry, the total last. */
export async function GET(request: Request) {
  await requireRole("SUPER_ADMIN");
  const params = Object.fromEntries(new URL(request.url).searchParams), range = commissionRange(params);
  const rows = (await getCommissions()).filter(row => inRange(row, range)).reverse();
  const workbook = new ExcelJS.Workbook(), sheet = workbook.addWorksheet("Mening foizim"), usd = { numFmt: "#,##0.##" };
  sheet.columns = [{ header: "Sana", key: "date", width: 18, style: { numFmt: "dd.mm.yyyy hh:mm" } }, { header: "Kimdan", key: "from", width: 26 }, { header: "Savdo, $", key: "base", width: 14, style: usd }, { header: "Foiz, %", key: "percent", width: 10 }, { header: "Summa, $", key: "amount", width: 14, style: usd }, { header: "Izoh", key: "note", width: 50 }];
  for (const row of rows) sheet.addRow({ date: local(row.occurredAt), from: row.fromName, base: row.base, percent: row.percent, amount: row.amount, note: row.note });
  sheet.addRow({ from: "Jami", amount: sumOf(rows) }).font = { bold: true };
  sheet.getRow(1).font = { bold: true };
  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer as ArrayBuffer), { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="mening-foizim.xlsx"`, "cache-control": "private, no-store" } });
}
