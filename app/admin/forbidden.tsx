import Link from "next/link";
import { ShieldAlert } from "lucide-react";

/** 403 inside /admin (forbidden() from a guard). Pages normally redirect a SELLER to /admin/my, so this is the fallback. */
export default function AdminForbidden() {
  return <main className="admin-forbidden">
    <div className="admin-forbidden-card">
      <span className="admin-forbidden-icon"><ShieldAlert size={28}/></span>
      <small>403</small>
      <h1>Bu bo‘limga ruxsatingiz yo‘q</h1>
      <p>Sizning hisobingiz uchun bu sahifa yopiq. O‘z bo‘limingizga qayting yoki administrator bilan bog‘laning.</p>
      <Link className="admin-primary-button" href="/admin/my">Mening bo‘limimga qaytish</Link>
    </div>
  </main>;
}
