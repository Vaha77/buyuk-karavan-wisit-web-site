import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/require-admin";
import { getDb } from "@/lib/db";
import { daysWithoutPurchase, dayNumber, isDue } from "@/lib/customers/seller-rules";
import { formatDayMonth, formatInt } from "@/lib/dashboard/format";

export const metadata: Metadata = { title: "Nazorat — Admin | BUYUK KARAVAN" };

export default async function ControlPage() {
  await requireRole("SUPER_ADMIN", "ADMIN");
  const today = new Date();
  const [sellers, customers] = await Promise.all([
    getDb().salesPerson.findMany({ orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, isActive: true, telegramChatId: true, user: { select: { id: true } } } }),
    getDb().regularCustomer.findMany({ where: { isActive: true }, select: { id: true, name: true, ownerId: true, callIntervalDays: true, lastPurchaseAt: true, nextContactAt: true, createdAt: true, contacts: { orderBy: { at: "desc" }, take: 1, select: { at: true } } } }),
  ]);
  // Due customers whose last call is older than 7 days (or that were never called).
  const stale = (customer: (typeof customers)[number]) => isDue(customer, today) && (!customer.contacts[0] || dayNumber(today) - dayNumber(customer.contacts[0].at) >= 7);
  const rows = [...sellers.map(seller => ({ id: seller.id, name: seller.name, isActive: seller.isActive, hasLogin: !!seller.user, hasTelegram: !!seller.telegramChatId })), { id: null, name: "Biriktirilmagan", isActive: true, hasLogin: false, hasTelegram: false }].map(seller => {
    const own = customers.filter(customer => customer.ownerId === seller.id);
    const due = own.filter(customer => isDue(customer, today));
    const overdue = due.filter(customer => daysWithoutPurchase(customer, today) >= customer.callIntervalDays);
    const notCalled = own.filter(stale).sort((a, b) => daysWithoutPurchase(b, today) - daysWithoutPurchase(a, today));
    return { ...seller, total: own.length, due: due.length, overdue: overdue.length, notCalled };
  }).filter(row => row.total > 0 || (row.id && row.isActive));

  return <div className="bk">
    <div className="bk-head"><div><h1>Nazorat</h1><p className="bk-muted">Har bir sotuvchida nechta mijozga qo‘ng‘iroq vaqti o‘tgan va 7 kundan beri qo‘ng‘iroq qilinmaganlar</p></div></div>
    <section className="bk-card">
      <div className="bk-table-wrap"><table className="bk-table">
        <thead><tr><th>Sotuvchi</th><th>Mijozlar</th><th>Bugun qo‘ng‘iroq</th><th>Muddati o‘tgan</th><th>7+ kun qo‘ng‘iroqsiz</th><th className="is-left">Kirish / Telegram</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.id ?? "none"}>
          <td className="is-strong">{row.name}</td><td>{formatInt(row.total)}</td><td>{formatInt(row.due)}</td>
          <td className={row.overdue ? "is-orange" : undefined}>{formatInt(row.overdue)}</td><td className={row.notCalled.length ? "is-orange" : undefined}>{formatInt(row.notCalled.length)}</td>
          <td className="is-left">{row.id ? <>{row.hasLogin ? <span className="bk-badge">login bor</span> : <span className="bk-badge is-grey">login yo‘q</span>} {row.hasTelegram ? <span className="bk-badge">Telegram</span> : <span className="bk-badge is-grey">Telegram yo‘q</span>}</> : <span className="bk-muted">faqat admin</span>}</td>
        </tr>)}</tbody>
      </table></div>
    </section>
    {rows.filter(row => row.notCalled.length).map(row => <section key={row.id ?? "none"} className="bk-card" aria-label={`${row.name}: qo‘ng‘iroq qilinmaganlar`}>
      <div className="bk-card-head"><div><h2>{row.name}</h2><span className="bk-muted">7 kundan beri qo‘ng‘iroq qilinmagan · {row.notCalled.length} ta</span></div></div>
      <div className="bk-list">{row.notCalled.map(customer => <div key={customer.id}>
        <div className="bk-grow"><b>{customer.name}</b><span>{customer.contacts[0] ? `Oxirgi qo‘ng‘iroq: ${formatDayMonth(customer.contacts[0].at)}` : "Hali qo‘ng‘iroq qilinmagan"} · oraliq {customer.callIntervalDays} kun</span></div>
        <span className={`sl-days${daysWithoutPurchase(customer, today) >= customer.callIntervalDays ? " is-red" : " is-yellow"}`}>{daysWithoutPurchase(customer, today)} kun</span>
      </div>)}</div>
    </section>)}
  </div>;
}
