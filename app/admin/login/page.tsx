import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/session";
import { LoginForm } from "./login-form";
import "./login.css";
import Link from "next/link";

export const metadata: Metadata = { title: "Kirish — Admin | BUYUK KARAVAN" };

export default async function AdminLoginPage() {
  if (await getAdminSession()) redirect("/admin");
  return <main className="admin-login"><div className="admin-login-card">
    <div className="admin-login-brand"><span className="admin-login-mark">✳</span><strong>BUYUK KARAVAN</strong></div>
    <div className="admin-login-intro"><span>HIMOYALANGAN HUDUD</span><h1>Admin Panel</h1><p>Davom etish uchun hisobingizga kiring.</p></div>
    <LoginForm /><Link className="admin-register-link" href="/admin/register">Ro‘yxatdan o‘tish</Link>
  </div></main>;
}
