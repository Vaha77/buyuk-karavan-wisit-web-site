import ExcelJS from "exceljs";
import { requireRole } from "@/lib/auth/require-admin";
import { getDebtEntries, getEmployees } from "@/lib/employees/queries";
import { DEBT_NOTES, withBalance } from "@/lib/employees/rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Excel has no time zone: write the Tashkent wall-clock time.
const local = (date: Date) => new Date(date.getTime() + 5 * 3_600_000);

/** One hodim (?id=) or everybody: the summary sheet, then each hodim's rows on a sheet of their own. */
export async function GET(request: Request) {
  await requireRole("SUPER_ADMIN");
  const id = new URL(request.url).searchParams.get("id") ?? undefined;
  const [employees, entries] = await Promise.all([getEmployees(), getDebtEntries(id)]);
  const workbook = new ExcelJS.Workbook();
  const summary = workbook.addWorksheet("Hodimlar");
  summary.columns = [{ header: "Ism", key: "name", width: 26 }, { header: "Qarz, $", key: "debt", width: 14, style: { numFmt: "#,##0.##" } }, { header: "Oxirgi to‘lov", key: "paid", width: 16, style: { numFmt: "dd.mm.yyyy" } }, { header: "Arxiv", key: "archived", width: 8 }];
  employees.filter(item => !id || item.id === id).forEach((employee, index) => {
    const rows = entries.filter(row => row.employeeId === employee.id), lastPaid = rows.findLast(row => row.type === "PAYMENT");
    summary.addRow({ name: employee.name, debt: employee.debt, paid: lastPaid && local(lastPaid.occurredAt), archived: employee.archived ? "ha" : "" });
    // Sheet names: 31 characters, unique, none of \ / * ? : [ ].
    const sheet = workbook.addWorksheet(`${index + 1} ${employee.name.replace(/[\\/*?:[\]]/g, " ")}`.slice(0, 31));
    sheet.columns = [{ header: "Sana", key: "date", width: 18, style: { numFmt: "dd.mm.yyyy hh:mm" } }, { header: "Turi", key: "type", width: 18 }, { header: "Izoh", key: "note", width: 50 }, { header: "Qarz yozildi", key: "debt", width: 14, style: { numFmt: "#,##0.##" } }, { header: "To‘ladi", key: "paid", width: 14, style: { numFmt: "#,##0.##" } }, { header: "Qoldiq", key: "balance", width: 14, style: { numFmt: "#,##0.##" } }];
    for (const row of withBalance(rows).reverse()) sheet.addRow({ date: local(row.occurredAt), type: DEBT_NOTES[row.type], note: row.note, debt: row.type === "PAYMENT" ? null : row.amount, paid: row.type === "PAYMENT" ? row.amount : null, balance: row.balance });
    sheet.getRow(1).font = { bold: true };
  });
  summary.getRow(1).font = { bold: true };
  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer as ArrayBuffer), { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="hodimlar${id ? `-${id}` : ""}.xlsx"`, "cache-control": "private, no-store" } });
}
