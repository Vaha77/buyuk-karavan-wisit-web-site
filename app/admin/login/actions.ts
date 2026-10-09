"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { normalizeUzPhone } from "@/lib/auth/phone";
import { verifyPassword } from "@/lib/auth/password";
import { encryptPassword, needsPasswordCapture } from "@/lib/auth/password-vault";
import { createAdminSession, deleteAdminSession } from "@/lib/auth/session";
import { PASSWORD_PAGE, homeFor } from "@/lib/auth/seller-access";
import { clearLoginFailures, isLoginLimited, recordLoginFailure } from "@/lib/auth/login-limit";

export type LoginState = { error: string | null };
const INVALID = "Telefon raqam yoki parol noto‘g‘ri.";

export async function loginAction(_state: LoginState, formData: FormData): Promise<LoginState> {
  const phoneInput = formData.get("phone");
  const passwordInput = formData.get("password");
  if (typeof phoneInput !== "string" || typeof passwordInput !== "string" || passwordInput.length > 256) {
    return { error: INVALID };
  }
  const phone = normalizeUzPhone(phoneInput);
  if (!phone) return { error: INVALID };
  if (await isLoginLimited(phone)) return { error: INVALID };
  const user = await getDb().adminUser.findUnique({ where: { phone } });
  if (user?.approvalStatus==="PENDING"&&await verifyPassword(passwordInput,user.passwordHash)) return {error:"Hisobingiz hali administrator tomonidan tasdiqlanmagan."};
  if (!user || !user.isActive || user.approvalStatus!=="APPROVED" || !(await verifyPassword(passwordInput, user.passwordHash))) {
    await recordLoginFailure(phone);
    return { error: INVALID };
  }
  await clearLoginFailures(phone);
  // Older accounts have no viewable copy yet: keep the password the user just proved, encrypted. Silent on purpose —
  // a failure here never blocks the login and nothing about the password is logged.
  if (needsPasswordCapture(user.passwordEncrypted, passwordInput)) {
    await getDb().adminUser.update({ where: { id: user.id }, data: { passwordEncrypted: encryptPassword(passwordInput) } }).catch(() => undefined);
  }
  await createAdminSession(user.id);
  // Signed in with a temporary password from "Parolni tiklash": set a new one first.
  redirect(user.mustPasswordChange ? PASSWORD_PAGE : homeFor(user.role));
}

export async function logoutAction(): Promise<void> {
  await deleteAdminSession();
  redirect("/admin/login");
}
