import "server-only";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/require-admin";

export class CategoryValidationError extends Error {}
export class CategoryInUseError extends Error { constructor(public count: number) { super(`Bu kategoriyada ${count} ta mahsulot mavjud.`); } }

function cleanName(value: string) {
  const name = value.trim().replace(/\s+/g, " ");
  if (!name || name.length > 120) throw new CategoryValidationError("Kategoriya nomini to‘g‘ri kiriting.");
  return name;
}
function baseSlug(value: string) {
  return value.toLocaleLowerCase("uz-UZ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[‘’'`]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "kategoriya";
}
async function uniqueSlug(name: string, excludeId?: string) {
  const base = baseSlug(name);
  for (let n = 0; n < 1000; n++) {
    const slug = n ? `${base}-${n + 1}` : base;
    const found = await getDb().productCategory.findFirst({ where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { id: true } });
    if (!found) return slug;
  }
  throw new CategoryValidationError("Kategoriya uchun noyob slug yaratib bo‘lmadi.");
}
async function ensureUniqueName(name: string, excludeId?: string) {
  const found = await getDb().productCategory.findFirst({ where: { name: { equals: name, mode: "insensitive" }, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { id: true } });
  if (found) throw new CategoryValidationError("Bu nomdagi kategoriya mavjud.");
}
function refresh() { revalidatePath("/admin/products"); revalidatePath("/products"); revalidatePath("/"); }

export async function createProductCategory(rawName: string) {
  await requireAdmin(); const name = cleanName(rawName); await ensureUniqueName(name);
  const max = await getDb().productCategory.aggregate({ _max: { order: true } });
  const row = await getDb().productCategory.create({ data: { name, slug: await uniqueSlug(name), order: (max._max.order ?? -1) + 1 } });
  refresh(); return row;
}
export async function updateProductCategory(id: string, input: { name: string; isActive: boolean; order: number }) {
  await requireAdmin(); const name = cleanName(input.name); await ensureUniqueName(name, id);
  const row = await getDb().productCategory.update({ where: { id }, data: { name, slug: await uniqueSlug(name, id), isActive: input.isActive, order: Math.max(0, Math.trunc(input.order)) } });
  refresh(); return row;
}
export async function deleteProductCategory(id: string, moveToId?: string) {
  await requireAdmin();
  const count = await getDb().product.count({ where: { categoryId: id } });
  if (count && !moveToId) throw new CategoryInUseError(count);
  if (moveToId === id) throw new CategoryValidationError("Boshqa kategoriyani tanlang.");
  await getDb().$transaction(async tx => {
    if (count) {
      const target = await tx.productCategory.findUnique({ where: { id: moveToId } });
      if (!target) throw new CategoryValidationError("Ko‘chirish kategoriyasi topilmadi.");
      await tx.product.updateMany({ where: { categoryId: id }, data: { categoryId: target.id } });
    }
    await tx.productCategory.delete({ where: { id } });
  });
  refresh();
}
