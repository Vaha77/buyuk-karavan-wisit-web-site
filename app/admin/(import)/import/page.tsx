import type { Metadata } from "next";
import Link from "next/link";
import { requireImportUser } from "@/lib/auth/require-admin";
import { getDb } from "@/lib/db";
import { listProducts } from "@/lib/import/service";
import { importNumber, type Cart } from "@/lib/import/rules";
import { CatalogBoard } from "@/components/admin/import/catalog-board";

export const metadata: Metadata = { title: "Import buyurtma — Admin | BUYUK KARAVAN" };

type Search = Record<"q" | "cat" | "group" | "type" | "edit", string | string[] | undefined>;
const one = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export default async function ImportCatalogPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireImportUser();
  const raw = await searchParams;
  const [q, cat, group, type, edit] = (["q", "cat", "group", "type", "edit"] as const).map(key => one(raw[key]));
  const [data, order] = await Promise.all([
    listProducts(user, { q, cat, group, type }),
    edit ? getDb().importOrder.findFirst({ where: { id: edit, sellerId: user.id, status: "RETURNED" }, include: { items: { include: { product: { select: { code: true, nameUz: true, model: true } } } } } }) : null,
  ]);
  const editing = order && {
    orderId: order.id, number: importNumber(order.number), note: order.decisionNote,
    client: order.client ?? "", neededBy: order.neededBy?.toISOString().slice(0, 10) ?? "", comment: order.comment ?? "",
    cart: Object.fromEntries(order.items.map(item => [item.productId, { qty: item.qty, code: item.product.code, name: item.product.nameUz, model: item.product.model }])) as Cart,
  };
  return <div className="bk">
    <div className="bk-head"><div><h1>Import buyurtma</h1><p className="bk-muted">Katalogdan tanlang, savatchaga joylang va tasdiqlovchiga yuboring</p></div><Link className="imp-link" href="/admin/import/my">Mening zayavkalarim →</Link></div>
    <CatalogBoard data={data} filters={{ q: q ?? "", cat: cat ?? "", group: group ?? "", type: type ?? "" }} edit={editing}/>
  </div>;
}
