import ExcelJS from "exceljs";
import { requireRole } from "@/lib/auth/require-admin";
import { kindOf, monthOrders } from "@/lib/sex/queries";
import { PURPOSE_LABEL, STATUS_LABEL, TYPE_LABEL, orderNumber, when, type PriceSnapshot } from "@/lib/sex/rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Monthly reconciliation file for SUPER_ADMIN (price-list prices only). */
export async function GET(request: Request) {
  await requireRole("SUPER_ADMIN");
  const { range, orders } = await monthOrders(new URL(request.url).searchParams.get("month") ?? undefined);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(range.label);
  sheet.columns = [
    { header: "№", key: "number", width: 8 }, { header: "Sana", key: "date", width: 16 }, { header: "Turi", key: "type", width: 10 }, { header: "Mahsulot", key: "product", width: 60 },
    { header: "Zayavka beruvchi", key: "seller", width: 18 }, { header: "Kimga", key: "to", width: 26 }, { header: "Holat", key: "status", width: 14 },
    { header: "Qabul qildi", key: "accepted", width: 24 }, { header: "Terishni boshladi", key: "started", width: 24 }, { header: "Chiqarib yubordi", key: "issued", width: 24 }, { header: "Krimga oldi", key: "received", width: 24 },
    { header: "Prays narxi", key: "base", width: 12 }, { header: "Zayavkasiz", key: "noRequest", width: 11 },
  ];
  const step = (name: string | undefined, at: Date | null) => (at ? `${name ?? "—"} · ${when(at)}` : "");
  for (const order of orders) {
    const snapshot = order.priceSnapshot as PriceSnapshot | null;
    sheet.addRow({
      number: orderNumber(order.number), date: when(order.createdAt), type: TYPE_LABEL[kindOf(order)],
      product: order.type === "AGREGAT" ? `${order.items[0]?.title ?? ""}${order.qty > 1 ? ` ×${order.qty}` : ""}` : order.items.map(item => `${item.title} ×${item.issuedQty ?? item.qty}`).join(", "),
      seller: order.seller.name, to: order.purpose === "CLIENT" ? `Mijoz: ${order.customerName ?? ""}` : PURPOSE_LABEL.SHOP, status: STATUS_LABEL[order.status],
      accepted: step(order.acceptedBy?.name, order.acceptedAt), started: step(order.startedBy?.name, order.startedAt), issued: step(order.issuedBy?.name, order.issuedAt), received: step(order.receivedBy?.name, order.receivedAt),
      base: snapshot?.totalBaseUsd ?? null, noRequest: order.noRequest ? "ha" : "",
    });
  }
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer as ArrayBuffer), { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="seh-zakazlari-${range.key}.xlsx"`, "cache-control": "private, no-store" } });
}
