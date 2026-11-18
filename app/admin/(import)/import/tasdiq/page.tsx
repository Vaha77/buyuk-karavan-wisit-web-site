import type { Metadata } from "next";
import { ApproveBoard, type ApproveOrder } from "@/components/admin/import/approve-board";
import "@/components/admin/import/import-admin.css";
import { requireImportUser } from "@/lib/auth/require-admin";
import { formatDecimal } from "@/lib/dashboard/format";
import { canApprove, effectiveQty, importNumber } from "@/lib/import/rules";
import { importApproverId, ordersWithStatus } from "@/lib/import/service";
import { when } from "@/lib/sex/rules";

export const metadata: Metadata = { title: "Import — tasdiqlash | BUYUK KARAVAN" };
const money = (amount: number, currency: string) => `${formatDecimal(amount, 2)} ${currency}`;

/** Approver (or Super Admin): PENDING import orders with prices. */
export default async function Page() {
  const user = await requireImportUser();
  if (!canApprove(user, await importApproverId())) return <div className="bk"><div className="bk-empty">Bu sahifa faqat tasdiqlovchi uchun.</div></div>;
  const orders: ApproveOrder[] = (await ordersWithStatus("PENDING")).map(order => {
    const sums = new Map<string, number>();
    for (const item of order.items) if (item.product.priceAmount != null) {
      const currency = item.product.priceCurrency ?? item.product.catalog.agent.currency;
      sums.set(currency, (sums.get(currency) ?? 0) + Number(item.product.priceAmount) * effectiveQty(item));
    }
    return {
      id: order.id, number: importNumber(order.number), created: when(order.createdAt), seller: order.seller.name,
      catalogs: [...new Set(order.items.map(item => `${item.product.catalog.agent.name} · ${item.product.catalog.title}`))].join(", "),
      items: order.items.map(item => ({ id: item.id, model: item.product.model, nameUz: item.product.nameUz, qty: effectiveQty(item) })),
      sum: [...sums].map(([currency, amount]) => money(amount, currency)).join(" + "),
      neededBy: order.neededBy?.toISOString().slice(0, 10) ?? "", client: order.client ?? "", comment: order.comment ?? "",
    };
  });
  return <div className="bk"><ApproveBoard orders={orders}/></div>;
}
