import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { logoutAction } from "@/app/admin/login/actions";
import { homeFor } from "@/lib/auth/seller-access";
import { getAdminSession } from "@/lib/auth/session";
import { NewPasswordForm } from "./password-form";
import "../login/login.css";

export const metadata: Metadata = { title: "Yangi parol — Admin | BUYUK KARAVAN" };

/** Only reachable while the account is on a temporary password ("Parolni tiklash"). */
export default async function NewPasswordPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  if (!session.user.mustPasswordChange) redirect(homeFor(session.user.role));
  return <main className="admin-login"><div className="admin-login-card">
    <div className="admin-login-brand"><span className="admin-login-mark">✳</span><strong>BUYUK KARAVAN</strong></div>
    <div className="admin-login-intro"><span>VAQTINCHALIK PAROL</span><h1>Yangi parol o‘rnating</h1><p>{session.user.name}, davom etish uchun o‘zingizning yangi parolingizni o‘rnating.</p></div>
    <NewPasswordForm/>
    <form action={logoutAction}><button type="submit" className="admin-register-link" style={{ width: "100%", background: "#fff", cursor: "pointer" }}>Chiqish</button></form>
  </div></main>;
}
