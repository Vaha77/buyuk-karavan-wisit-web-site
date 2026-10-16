import Link from "next/link";
import { withAccount } from "@/lib/instagram/constants";
import type { AccountOption } from "@/lib/instagram/queries";

type Tab = "comments" | "direct" | "stats" | "stories" | "voice";
const TABS: Array<{ key: Tab; label: string; href: string; superOnly?: boolean }> = [
  { key: "comments", label: "Kommentlar", href: "/admin/instagram" },
  { key: "direct", label: "Direct", href: "/admin/instagram?tab=direct" },
  { key: "stats", label: "Statistika", href: "/admin/instagram?tab=stats" },
  { key: "stories", label: "Storislar", href: "/admin/instagram/stories", superOnly: true },
  { key: "voice", label: "Ovoz", href: "/admin/instagram/voice", superOnly: true },
];

/** The selected account from ?account= (unknown / missing → the first connected). */
export const pickAccount = (accounts: AccountOption[], requested?: string) => accounts.find(account => account.id === requested) ?? accounts[0] ?? null;

/** Instagram pages: the account switcher (@buyuk_karavan / @eshikmaster…, kept in ?account=) and the section tabs. */
export function InstagramNav({ accounts, accountId, active, isSuper }: { accounts: AccountOption[]; accountId: string | null; active: Tab; isSuper: boolean }) {
  const current = TABS.find(tab => tab.key === active)!;
  return <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
    {accounts.length > 1 && <nav className="bk-chips" aria-label="Instagram akkaunt">
      {accounts.map(account => <Link key={account.id} className={`bk-chip${account.id === accountId ? " is-active" : ""}`} aria-current={account.id === accountId ? "page" : undefined} href={withAccount(current.href, account.id)}>@{account.username}</Link>)}
    </nav>}
    <nav className="bk-chips" aria-label="Instagram bo‘limlari">
      {TABS.filter(tab => !tab.superOnly || isSuper).map(tab => <Link key={tab.key} className={`bk-chip${tab.key === active ? " is-active" : ""}`} href={withAccount(tab.href, accountId)}>{tab.label}</Link>)}
    </nav>
  </div>;
}
