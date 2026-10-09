import Link from "next/link";
import { requireRole } from "@/lib/auth/require-admin";
import { isVaultEnabled } from "@/lib/auth/password-vault";
import { getDb } from "@/lib/db";
import { roleLabel } from "@/lib/telegram/start-rules";
import { CreateUserForm, UsersBoard, type ManagedUser, type SalesPersonOption } from "./user-forms";
import { StrayAgents } from "./stray-agents";
import { RestoreUserButton } from "./remove-user";

/** Users (SUPER_ADMIN). `?view=archive` lists archived users with "Qayta tiklash". Passwords never travel with the page. */
export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  await requireRole("SUPER_ADMIN");
  const archive = (await searchParams).view === "archive";
  const [rows, salesPeople, archivedCount] = await Promise.all([
    getDb().adminUser.findMany({ where: { archivedAt: archive ? { not: null } : null }, orderBy: [{ approvalStatus: "asc" }, { createdAt: "asc" }], select: { id: true, name: true, phone: true, role: true, isActive: true, approvalStatus: true, salesPersonId: true, telegramChatId: true, passwordEncrypted: true, archivedAt: true } }),
    getDb().salesPerson.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, user: { select: { id: true } } } }),
    getDb().adminUser.count({ where: { archivedAt: { not: null } } }),
  ]);
  // Only "is a password stored" goes to the browser, never the ciphertext.
  const users: ManagedUser[] = rows.map(({ passwordEncrypted, archivedAt, ...user }) => { void archivedAt; return { ...user, passwordStored: !!passwordEncrypted }; });
  const people: SalesPersonOption[] = salesPeople.map(p => ({ id: p.id, name: p.name, userId: p.user?.id ?? null }));
  const filters = <nav className="bk-chips" aria-label="Foydalanuvchilar" style={{ marginBottom: 16 }}>
    <Link className={`bk-chip${archive ? "" : " is-active"}`} href="/admin/users">Faol</Link>
    <Link className={`bk-chip${archive ? " is-active" : ""}`} href="/admin/users?view=archive">Arxiv <small>{archivedCount}</small></Link>
  </nav>;
  if (archive) return <div className="admin-products-page"><div className="admin-page-heading"><div><h1>Arxivlangan foydalanuvchilar</h1><p>Bog‘langan ma’lumoti borligi uchun o‘chirilmagan · kira olmaydi</p></div></div>{filters}
    <section className="admin-panel admin-management-panel admin-audit-panel"><div className="admin-user-list">{users.length ? users.map(user => <div key={user.id} className="admin-user-row" style={{ alignItems: "center" }}><div><strong>{user.name}</strong><small>{user.phone} · {roleLabel(user.role)}</small></div><RestoreUserButton userId={user.id}/></div>) : <p style={{ margin: 0, color: "#5B6B82" }}>Arxiv bo‘sh.</p>}</div></section>
  </div>;
  const pending = users.filter(x => x.approvalStatus === "PENDING"), managed = users.filter(x => x.approvalStatus !== "PENDING");
  // Waiting seller records on Telegram accounts that belong to a non-seller profile (shown, deleted only by hand).
  const linked = users.filter(x => x.telegramChatId && /^\d+$/.test(x.telegramChatId) && x.role !== "SELLER");
  const stray = linked.length ? await getDb().salesAgent.findMany({ where: { isApproved: false, telegramUserId: { in: linked.map(x => BigInt(x.telegramChatId!)) } }, select: { id: true, firstName: true, lastName: true, telegramUsername: true, telegramUserId: true } }) : [];
  const strayAgents = stray.map(a => { const owner = linked.find(x => x.telegramChatId === a.telegramUserId.toString())!; return { id: a.id, name: [a.firstName, a.lastName].filter(Boolean).join(" "), username: a.telegramUsername, profileName: owner.name, profileRole: roleLabel(owner.role) }; });
  return <div className="admin-products-page"><div className="admin-page-heading"><div><h1>Admin foydalanuvchilar</h1><p>Har bir xodim uchun alohida kirish hisobi</p></div></div>{filters}
    <StrayAgents agents={strayAgents}/>
    <UsersBoard pending={pending} managed={managed} people={people} viewEnabled={isVaultEnabled()}><section className="admin-form-card"><div className="admin-form-card-heading"><h2>Yangi foydalanuvchi</h2></div><CreateUserForm people={people}/></section></UsersBoard>
  </div>;
}
