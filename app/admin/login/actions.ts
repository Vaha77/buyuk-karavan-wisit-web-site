"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { normalizeUzPhone } from "@/lib/auth/phone";
import { verifyPassword } from "@/lib/auth/password";
import { createAdminSession, deleteAdminSession } from "@/lib/auth/session";
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
  await createAdminSession(user.id);
  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  await deleteAdminSession();
  redirect("/admin/login");
}
