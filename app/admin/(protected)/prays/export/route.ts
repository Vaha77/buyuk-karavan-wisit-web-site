import ExcelJS from "exceljs";
import { requireRole } from "@/lib/auth/require-admin";
import { getMarkupPercent, getPraysProducts, getSexParts } from "@/lib/prays/queries";
import { sellPrice } from "@/lib/prays/rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** "Excel yuklab olish": the current price list. The same file can be edited and uploaded back (rows match by ID). */
export async function GET() {
  await requireRole("SUPER_ADMIN");
  const [products, parts, markup] = await Promise.all([getPraysProducts(), getSexParts(), getMarkupPercent()]);
  const workbook = new ExcelJS.Workbook();
  const date = (value: string | null) => (value ? new Date(value) : null);
  const ready = workbook.addWorksheet("Tayyor mahsulotlar");
  ready.columns = [{ header: "ID", key: "id", width: 28 }, { header: "Nomi", key: "name", width: 60 }, { header: "Brend", key: "brand", width: 14 }, { header: "Model", key: "model", width: 16 }, { header: "Prays narxi", key: "base", width: 14 }, { header: `Sotuv narxi (+${markup}%)`, key: "sale", width: 18 }, { header: "Prays sanasi", key: "date", width: 14 }];
  for (const product of products) ready.addRow({ id: product.id, name: product.name, brand: product.brand, model: product.model, base: product.basePriceUsd, sale: product.basePriceUsd === null ? product.priceUsd : sellPrice(product.basePriceUsd, markup), date: date(product.priceListDate) });
  const sex = workbook.addWorksheet("Seh zapchastlari");
  sex.columns = [{ header: "ID", key: "id", width: 28 }, { header: "Nomi", key: "name", width: 34 }, { header: "O‘lcham", key: "size", width: 12 }, { header: "Guruh", key: "group", width: 16 }, { header: "Birlik", key: "unit", width: 10 }, { header: "Prays narxi", key: "base", width: 14 }, { header: "Prays sanasi", key: "date", width: 14 }];
  for (const part of parts) sex.addRow({ id: part.id, name: part.name, size: part.size, group: part.group, unit: part.unit, base: part.basePriceUsd, date: date(part.priceListDate) });
  for (const sheet of [ready, sex]) { sheet.getRow(1).font = { bold: true }; sheet.views = [{ state: "frozen", ySplit: 1 }]; sheet.getColumn("date").numFmt = "dd.mm.yy"; sheet.getColumn("base").numFmt = "#,##0.##"; }
  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer as ArrayBuffer), { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="prays-${new Date().toISOString().slice(0, 10)}.xlsx"`, "cache-control": "private, no-store" } });
}
