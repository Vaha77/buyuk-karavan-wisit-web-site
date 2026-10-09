// "O‘chirish" on the users page: delete a user only when nothing refers to them; otherwise archive (history stays intact).
// Pure, so the tests check the rules.

export type UserLinks = { orders: number; calculations: number; customers: number; sales: number; other: number; activity: number };
const LABELS: Array<[keyof UserLinks, string]> = [["orders", "zakaz"], ["calculations", "hisob-kitob"], ["customers", "mijoz/xarid yozuvi"], ["sales", "sotuv yozuvi"], ["other", "boshqa yozuv"], ["activity", "faoliyat yozuvi"]];

export function removalPlan(links: UserLinks) {
  const parts = LABELS.filter(([key]) => links[key] > 0).map(([key, label]) => `${links[key]} ta ${label}`);
  if (!parts.length) return { mode: "delete" as const, parts, text: "Bog‘langan ma’lumot yo‘q — butunlay o‘chiriladi." };
  return { mode: "archive" as const, parts, text: `Bu foydalanuvchida ${parts.join(", ")} bor — arxivlanadi (kira olmaydi, ro‘yxatdan yo‘qoladi, “Arxiv” filtrida qoladi va qayta tiklash mumkin).` };
}

/** Not yourself, and never the last active Super Admin. */
export function checkRemoval(actorId: string, target: { id: string; role: string }, otherActiveSuperAdmins: number): { ok: true } | { ok: false; error: string } {
  if (target.id === actorId) return { ok: false, error: "O‘zingizni o‘chira olmaysiz." };
  if (target.role === "SUPER_ADMIN" && otherActiveSuperAdmins < 1) return { ok: false, error: "Oxirgi Super Adminni o‘chirib bo‘lmaydi." };
  return { ok: true };
}
