"use server";

import { redirect } from "next/navigation";
import { writeAudit } from "@/lib/audit/service";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { encryptPassword } from "@/lib/auth/password-vault";
import { homeFor } from "@/lib/auth/seller-access";
import { createAdminSession, getAdminSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";

export type NewPasswordState = { error: string | null };

/** After "Parolni tiklash": the user replaces the temporary password; all their sessions are renewed. */
export async function setNewPasswordAction(_state: NewPasswordState, form: FormData): Promise<NewPasswordState> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const user = session.user;
  if (!user.mustPasswordChange) redirect(homeFor(user.role));
  const password = String(form.get("password") ?? ""), confirm = String(form.get("confirm") ?? "");
  if (password.length < 12 || Buffer.byteLength(password, "utf8") > 72) return { error: "Parol kamida 12 ta belgidan iborat bo‘lsin." };
  if (password !== confirm) return { error: "Parollar bir xil emas." };
  if (await verifyPassword(password, user.passwordHash)) return { error: "Vaqtinchalik paroldan boshqa parol tanlang." };
  const db = getDb();
  await db.$transaction([
    db.adminUser.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password), passwordEncrypted: encryptPassword(password), mustPasswordChange: false } }),
    db.adminSession.deleteMany({ where: { userId: user.id } }),
  ]);
  await createAdminSession(user.id);
  await writeAudit(user, { action: "PASSWORD_CHANGE", entityType: "ADMIN_USER", entityId: user.id, entityName: user.name, summary: "Vaqtinchalik parolni yangi parolga almashtirdi" });
  redirect(homeFor(user.role));
}
