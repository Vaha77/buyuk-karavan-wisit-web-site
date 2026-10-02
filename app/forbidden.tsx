import Link from "next/link";

export default function Forbidden() {
  return <main style={{ minHeight: "60vh", display: "grid", placeItems: "center", padding: 24, textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
    <div style={{ display: "grid", gap: 10 }}>
      <strong style={{ fontSize: 40 }}>403</strong>
      <p>Bu bo‘limni ko‘rishga ruxsatingiz yo‘q.</p>
      <Link href="/admin/my">Mening mijozlarim</Link>
    </div>
  </main>;
}
