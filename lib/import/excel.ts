// Import buyurtma: boss summary workbook ("Umumiy" + per catalog a full sheet and a "zavodga" sheet). No server-only: the tests load it.
import ExcelJS from "exceljs";
import { factoryLines, type CatalogGroup } from "./rules";

const TITLE_FONT = { name: "Arial", bold: true, size: 14, color: { argb: "FF1F2A44" } };
const round2 = (n: number) => Math.round(n * 100) / 100;
const ref = (sheet: string, cell: string) => `'${sheet.replace(/'/g, "''")}'!${cell}`;

/** Excel sheet names: no []:*?/\, ≤31 chars, unique case-insensitively. */
function sheetNamer() {
  const used = new Set(["umumiy"]);
  return (raw: string, suffix = "") => {
    const base = (raw.replace(/[[\]:*?/\\]/g, " ").replace(/^'+|'+$/g, "").trim() || "Katalog").slice(0, 31 - suffix.length);
    let name = base + suffix;
    for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base.slice(0, 31 - suffix.length - String(i).length - 1)}-${i}${suffix}`;
    used.add(name.toLowerCase());
    return name;
  };
}

/** Header row 3, data from row 4, JAMI row with SUM over `sumCols`; `amountCol` = qtyCol × priceCol only when a price exists. */
function addLinesSheet(workbook: ExcelJS.Workbook, name: string, title: string, headers: string[], widths: number[], rows: Array<Array<string | number | null>>, cols: { qty: number; price: number; amount: number }) {
  const sheet = workbook.addWorksheet(name, { views: [{ state: "frozen", ySplit: 3 }] });
  sheet.getCell("A1").value = title;
  sheet.getCell("A1").font = TITLE_FONT;
  sheet.getRow(3).values = headers;
  sheet.getRow(3).font = { bold: true };
  widths.forEach((width, i) => { sheet.getColumn(i + 1).width = width; });
  const letter = (col: number) => sheet.getColumn(col).letter;
  let qty = 0, amount = 0;
  rows.forEach((values, i) => {
    const row = sheet.getRow(4 + i);
    row.values = values.map(value => value ?? undefined) as ExcelJS.CellValue[];
    const q = Number(values[cols.qty - 1]), p = values[cols.price - 1];
    qty += q;
    if (typeof p === "number") {
      const result = round2(q * p);
      amount = round2(amount + result);
      row.getCell(cols.amount).value = { formula: `${letter(cols.qty)}${4 + i}*${letter(cols.price)}${4 + i}`, result };
    }
  });
  const last = 3 + rows.length, totalRow = sheet.getRow(last + 1);
  totalRow.getCell(1).value = "JAMI";
  totalRow.getCell(cols.qty).value = { formula: `SUM(${letter(cols.qty)}4:${letter(cols.qty)}${last})`, result: qty };
  totalRow.getCell(cols.amount).value = { formula: `SUM(${letter(cols.amount)}4:${letter(cols.amount)}${last})`, result: amount };
  totalRow.font = { bold: true };
  return { sheet, totalRow: last + 1, qty, amount };
}

export function buildImportWorkbook(groups: CatalogGroup[], title: string): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const summary = workbook.addWorksheet("Umumiy", { views: [{ state: "frozen", ySplit: 4 }] });
  summary.getCell("A1").value = title;
  summary.getCell("A1").font = TITLE_FONT;
  summary.getCell("A2").value = "“Kurs → USD” ustunini o‘zingiz to‘ldiring (USD uchun 1). Har katalog: to‘liq varaq + zavodga yuboriladigan varaq (sotuvchi/mijozsiz).";
  summary.getRow(4).values = ["Agent · Katalog", "Davlat", "Valyuta", "Pozitsiya", "Dona", "Summa (valyutada)", "Kurs → USD", "Summa (USD ekv.)"];
  summary.getRow(4).font = { bold: true };
  [28, 10, 9, 10, 8, 17, 12, 17].forEach((width, i) => { summary.getColumn(i + 1).width = width; });
  const name = sheetNamer();
  let usdTotal = 0, positions = 0, qtyTotal = 0;
  groups.forEach((group, i) => {
    const cur = group.currency;
    const full = name(group.code || group.title);
    const sheet = addLinesSheet(workbook, full, `${group.agent} · ${group.title} — ${group.country} · valyuta ${cur}`,
      ["Kod", "Model", "Nomi (EN)", "Nomi (UZ)", "Soni", `Narx (${cur})`, `Summa (${cur})`, "Sotuvchi", "Mijoz", "Zayavka"], [13, 16, 30, 30, 8, 12, 14, 14, 20, 11],
      group.lines.map(line => [line.code, line.model, line.nameEn, line.nameUz, line.qty, line.price, null, line.seller, line.client, line.order]), { qty: 5, price: 6, amount: 7 });
    const factory = factoryLines(group);
    addLinesSheet(workbook, name(group.code || group.title, " zavodga"), `${group.agent} — ${group.title} · ${cur}`,
      ["Code", "Model", "Name (EN)", "Qty", `Price (${cur})`, `Amount (${cur})`], [13, 16, 34, 8, 13, 15],
      factory.map(line => [line.code, line.model, line.nameEn, line.qty, line.price, null]), { qty: 4, price: 5, amount: 6 });
    const r = 5 + i, rate = cur === "USD" ? 1 : null;
    const row = summary.getRow(r);
    row.values = [`${group.agent} · ${group.title}`, group.country, cur, group.positions];
    row.getCell(5).value = { formula: ref(full, `E${sheet.totalRow}`), result: sheet.qty };
    row.getCell(6).value = { formula: ref(full, `G${sheet.totalRow}`), result: sheet.amount };
    if (rate) row.getCell(7).value = rate;
    row.getCell(8).value = { formula: `F${r}*G${r}`, result: rate ? round2(sheet.amount * rate) : 0 };
    usdTotal = round2(usdTotal + (rate ? sheet.amount * rate : 0));
    positions += group.positions; qtyTotal += sheet.qty;
  });
  const last = 4 + groups.length, total = summary.getRow(last + 1);
  total.getCell(1).value = "JAMI";
  total.getCell(4).value = { formula: `SUM(D5:D${last})`, result: positions };
  total.getCell(5).value = { formula: `SUM(E5:E${last})`, result: qtyTotal };
  total.getCell(8).value = { formula: `SUM(H5:H${last})`, result: usdTotal };
  total.font = { bold: true };
  return workbook;
}
