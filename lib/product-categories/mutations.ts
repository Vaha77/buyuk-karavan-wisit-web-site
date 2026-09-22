import "server-only";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/require-admin";
import { writeAudit } from "@/lib/audit/service";

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
  const actor=await requireAdmin(); const name = cleanName(rawName); await ensureUniqueName(name);
  const max = await getDb().productCategory.aggregate({ _max: { order: true } });
  const row = await getDb().productCategory.create({ data: { name, slug: await uniqueSlug(name), order: (max._max.order ?? -1) + 1 } });
  await writeAudit(actor,{action:"CREATE",entityType:"CATEGORY",entityId:row.id,entityName:row.name,summary:"Kategoriya yaratdi",after:{name:row.name,slug:row.slug,isActive:row.isActive,order:row.order}}); refresh(); return row;
}
export async function updateProductCategory(id: string, input: { name: string; isActive: boolean; order: number }) {
  const actor=await requireAdmin(); const previous=await getDb().productCategory.findUniqueOrThrow({where:{id}}); const name = cleanName(input.name); await ensureUniqueName(name, id);
  const row = await getDb().productCategory.update({ where: { id }, data: { name, slug: await uniqueSlug(name, id), isActive: input.isActive, order: Math.max(0, Math.trunc(input.order)) } });
  await writeAudit(actor,{action:"UPDATE",entityType:"CATEGORY",entityId:row.id,entityName:row.name,summary:"Kategoriyani yangiladi",before:{name:previous.name,slug:previous.slug,isActive:previous.isActive,order:previous.order},after:{name:row.name,slug:row.slug,isActive:row.isActive,order:row.order}}); refresh(); return row;
}
export async function deleteProductCategory(id: string, moveToId?: string) {
  const actor=await requireAdmin(); const previous=await getDb().productCategory.findUniqueOrThrow({where:{id}});
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
  await writeAudit(actor,{action:"DELETE",entityType:"CATEGORY",entityId:id,entityName:previous.name,summary:"Kategoriyani o‘chirdi",before:{name:previous.name,slug:previous.slug},metadata:{movedProducts:count,targetCategoryId:moveToId||null}});
  refresh();
}
