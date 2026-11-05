import ExcelJS from "exceljs";
import { requireRole } from "@/lib/auth/require-admin";
import { monthCloses, shortageHistory } from "@/lib/foizim/month";
import { getCommissions, getPeople, getShortages } from "@/lib/foizim/queries";
import { KINDS, sumOf } from "@/lib/foizim/rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Excel has no time zone: write the Tashkent wall-clock time.
const local = (date: Date) => new Date(date.getTime() + 5 * 3_600_000);

/** Every live row (kirim +, chiqim −), then the month closes and the kamomat history on sheets of their own. */
export async function GET() {
  await requireRole("SUPER_ADMIN");
  const [all, shortages, sellers, keepers] = await Promise.all([getCommissions(), getShortages(), getPeople("SELLER"), getPeople("STOREKEEPER")]);
  const name = Object.fromEntries([...sellers, ...keepers].map(item => [item.id, item.name])), { months } = monthCloses(all, shortages);
  const workbook = new ExcelJS.Workbook(), usd = { numFmt: "#,##0.##" }, date = { numFmt: "dd.mm.yyyy hh:mm" };
  const sheet = workbook.addWorksheet("Mening foizim");
  sheet.columns = [{ header: "Sana", key: "date", width: 18, style: date }, { header: "Turi", key: "kind", width: 22 }, { header: "Kimdan / nimaga", key: "from", width: 26 }, { header: "Sotuvchi", key: "seller", width: 20 }, { header: "Skladchi", key: "keeper", width: 20 }, { header: "Oylik oyi", key: "month", width: 11 }, { header: "Savdo, $", key: "base", width: 14, style: usd }, { header: "Foiz, %", key: "percent", width: 10 }, { header: "Summa, $", key: "amount", width: 14, style: usd }, { header: "Izoh", key: "note", width: 50 }];
  for (const row of [...all].reverse()) sheet.addRow({ date: local(row.occurredAt), kind: KINDS[row.kind].label, from: row.fromName, seller: row.sellerId ? name[row.sellerId] ?? row.fromName : null, keeper: row.storekeeperId ? name[row.storekeeperId] ?? row.fromName : null, month: row.salaryMonth, base: row.base, percent: row.percent, amount: row.direction === "IN" ? row.amount : -row.amount, note: row.note });
  sheet.addRow({ from: "Jami", amount: sumOf(all.map(row => ({ amount: row.direction === "IN" ? row.amount : -row.amount }))) }).font = { bold: true };
  const closes = workbook.addWorksheet("Oylar yakuni");
  closes.columns = [{ header: "Oy", key: "name", width: 16 }, { header: "Oy boshi", key: "start", width: 12, style: usd }, { header: "Kirim", key: "in", width: 12, style: usd }, { header: "Oyliklar", key: "salary", width: 12, style: usd }, { header: "Boshqa chiqim", key: "other", width: 14, style: usd }, { header: "Qoldiq", key: "result", width: 12, style: usd }, { header: "Kamomatdan ayrildi", key: "deducted", width: 18, style: usd }, { header: "Kamomat keyin", key: "shortageAfter", width: 15, style: usd }, { header: "Keyingi oyga", key: "carry", width: 13, style: usd }, { header: "Holat", key: "state", width: 12 }];
  for (const month of months) closes.addRow({ ...month, state: month.closed ? "yopilgan" : "ochiq (prognoz)" });
  const history = workbook.addWorksheet("Kamomat tarixi");
  history.columns = [{ header: "Sana", key: "date", width: 18, style: date }, { header: "Turi", key: "type", width: 22 }, { header: "Izoh", key: "note", width: 50 }, { header: "Summa, $", key: "amount", width: 14, style: usd }];
  for (const row of shortageHistory(shortages, months).reverse()) history.addRow({ date: local(row.occurredAt), type: row.auto ? "Avtomatik ayrildi" : { OPENING: "Boshlang‘ich", ADD: "Qo‘shildi", ADJUST: "Tuzatish" }[row.type], note: row.note, amount: row.amount });
  for (const each of [sheet, closes, history]) each.getRow(1).font = { bold: true };
  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer as ArrayBuffer), { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="mening-foizim.xlsx"`, "cache-control": "private, no-store" } });
}
