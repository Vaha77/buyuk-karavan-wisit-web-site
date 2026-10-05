import { requireSexUser } from "@/lib/auth/require-admin";

export default async function SexOrdersPage() {
  await requireSexUser();
  return <div className="sx"><div className="sx-head"><div><span className="sx-crumb">Sex</span><h1>Sex zakazlari</h1><p className="sx-lead">Bo‘lim tayyorlanmoqda.</p></div></div></div>;
}
