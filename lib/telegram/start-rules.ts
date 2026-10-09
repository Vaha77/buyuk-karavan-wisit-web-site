// What a /start in a private chat means. Pure (no database), so the tests can check it.
// A chat bound to an admin-panel profile (AdminUser.telegramChatId) is never registered as a BKLead seller (SalesAgent);
// a chat that already has a SalesAgent record never gets a second one.

export type LinkedProfile = { name: string; role: string };
export type ExistingAgent = { isApproved: boolean; isActive: boolean };
export type StartDecision =
  | { kind: "menu"; profile: LinkedProfile }
  | { kind: "agent"; approved: boolean }
  | { kind: "register" };

export function startDecision(linked: LinkedProfile | null, agent: ExistingAgent | null): StartDecision {
  if (linked) return { kind: "menu", profile: linked };
  if (agent) return { kind: "agent", approved: agent.isApproved && agent.isActive };
  return { kind: "register" };
}

export const ROLE_LABEL: Record<string, string> = { SUPER_ADMIN: "Super Admin", ADMIN: "Administrator", MANAGER: "Menejer", SELLER: "Sotuvchi", WORKSHOP: "Seh mas’uli" };
export const roleLabel = (role: string) => ROLE_LABEL[role] ?? role;

/** Reply to a plain /start from a chat already bound to a profile: that role's menu, no registration. */
export function profileMenuText(profile: LinkedProfile, siteUrl: string) {
  const head = `👋 Salom, ${profile.name} (${roleLabel(profile.role)}). Bu Telegram profilingizga bog‘langan.`;
  if (profile.role === "WORKSHOP") return [head, "", "Yangi seh zakazlari shu yerga tugmalar bilan keladi: ✅ Qabul qildim → 🔧 Terishni boshladim → 📦 Chiqib ketdi.", "", "/navbat — navbatdagi zakazlar", "/bugun — bugungi hisob"].join("\n");
  if (profile.role === "SELLER") return [head, "", "Sotuvchi menyusi pastda.", `Doimiy mijozlar va xaridlar: ${siteUrl}/admin/my`].join("\n");
  return [head, "", "Admin menyu:", `• Admin panel: ${siteUrl}/admin`, `• Seh zakazlari: ${siteUrl}/admin/seh`, "/navbat — seh navbati", "/bugun — bugungi seh hisobi"].join("\n");
}

/** A SalesAgent that pressed /start again while still waiting: the same record, no new registration. */
export function pendingAgentText(name: string) {
  return `Assalomu alaykum, ${name}! 👋\n\nSiz BKLead tizimida allaqachon ro‘yxatdan o‘tgansiz — administrator tasdig‘i kutilmoqda.`;
}

/** "/start seh_<code>" result; mentions the profile this chat was taken from, if any. */
export function linkedText(user: LinkedProfile, previousName: string | null) {
  const lines = [`✅ Ulandingiz: ${user.name}, ${roleLabel(user.role)}`];
  if (previousName) lines.push(`Bu Telegram avval ${previousName} ga bog‘langan edi, endi ${user.name} ga o‘tkazildi.`);
  if (user.role === "WORKSHOP") lines.push("", "Yangi seh zakazlari shu yerga keladi.", "/navbat — navbatdagilar", "/bugun — bugungi hisob");
  return lines.join("\n");
}
