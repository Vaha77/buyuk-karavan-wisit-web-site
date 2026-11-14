import Link from "next/link";
import type { myOrders } from "@/lib/import/service";
import { STATUS_LABEL, STATUS_TONE, effectiveQty, importNumber } from "@/lib/import/rules";

type Order = Awaited<ReturnType<typeof myOrders>>[number];
const day = new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Tashkent", day: "2-digit", month: "2-digit", year: "numeric" });

/** Seller's own import orders (no prices); RETURNED ones can be edited and sent again. */
export function MyOrders({ orders }: { orders: Order[] }) {
  if (!orders.length) return <div className="bk-empty">Hali zayavka yo‘q. <Link className="imp-link" href="/admin/import">Katalogdan tanlash</Link></div>;
  return <div className="bk-table-wrap"><table className="bk-table">
    <thead><tr><th>Raqam</th><th>Sana</th><th>Pozitsiya</th><th>Jami dona</th><th>Holat</th><th>Tovarlar</th></tr></thead>
    <tbody>{orders.map(order => <tr key={order.id}>
      <td><b>{importNumber(order.number)}</b></td>
      <td>{day.format(order.createdAt)}</td>
      <td>{order.items.length}</td>
      <td>{order.items.reduce((sum, item) => sum + effectiveQty(item), 0)}</td>
      <td>
        <span className={`imp-pill ${STATUS_TONE[order.status]}`}>{STATUS_LABEL[order.status]}</span>
        {(order.status === "RETURNED" || order.status === "REJECTED") && order.decisionNote && <div className="bk-muted" style={{ fontSize: 12, marginTop: 4 }}>Izoh: {order.decisionNote}</div>}
        {order.status === "RETURNED" && <div style={{ marginTop: 6 }}><Link className="imp-link" href={`/admin/import?edit=${order.id}`}>✎ Tahrirlab qayta yuborish</Link></div>}
      </td>
      <td><details className="imp-items"><summary>{order.items.length} ta</summary><ul>{order.items.map(item => <li key={item.id}>
        {item.product.model} — {item.product.nameUz} × {item.qty}{item.approvedQty != null && item.approvedQty !== item.qty ? ` → ${item.approvedQty}` : ""}
      </li>)}</ul></details></td>
    </tr>)}</tbody>
  </table></div>;
}
