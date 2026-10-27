"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/require-admin";
import { getDb } from "@/lib/db";
import { diffEntry, parseEntry } from "@/lib/kassa/rules";
import { ProjectImageError, uploadProjectImage } from "@/lib/projects/storage";

export type KassaResult = { ok: true } | { ok: false; error: string };

/** New entry, or a correction of an existing one (never a delete): each correction logs the changed fields. */
export async function saveEntryAction(form: FormData): Promise<KassaResult> {
  const user = await requireRole("SUPER_ADMIN");
  const parsed = parseEntry(Object.fromEntries(form));
  if (!parsed.ok) return parsed;
  const id = String(form.get("id") ?? ""), data = parsed.data, db = getDb();
  const [category, entry] = await Promise.all([db.kassaCategory.findUnique({ where: { id: data.categoryId } }), id ? db.kassaEntry.findFirst({ where: { id, deletedAt: null } }) : null]);
  if (id && !entry) return { ok: false, error: "Yozuv topilmadi." };
  if (!category || category.type !== data.type || (category.archived && entry?.categoryId !== category.id)) return { ok: false, error: "Kategoriyani tanlang." };
  const photo = form.get("receipt");
  let receiptUrl: string | undefined;
  if (photo instanceof File && photo.size > 0) {
    try { receiptUrl = await uploadProjectImage("kassa", photo); }
    catch (error) { return { ok: false, error: error instanceof ProjectImageError ? error.message : "Rasm yuklanmadi." }; }
  }
  const values = { ...data, ...(receiptUrl && { receiptUrl }) };
  if (!entry) await db.kassaEntry.create({ data: { ...values, createdById: user.id } });
  else {
    const changes = diffEntry({ ...entry, amount: Number(entry.amount) }, values);
    if (Object.keys(changes).length) await db.$transaction([db.kassaEntry.update({ where: { id }, data: values }), db.kassaEntryLog.create({ data: { entryId: id, userId: user.id, changes } })]);
  }
  revalidatePath("/admin/kassa", "layout");
  return { ok: true };
}

/** "+ Yangi" chip in the entry form. */
export async function createCategoryAction(name: string, type: "IN" | "OUT"): Promise<{ ok: true; category: { id: string; name: string; type: "IN" | "OUT"; icon: string | null } } | { ok: false; error: string }> {
  await requireRole("SUPER_ADMIN");
  const clean = String(name ?? "").trim();
  if (!clean || clean.length > 60 || (type !== "IN" && type !== "OUT")) return { ok: false, error: "Nomini yozing (60 belgigacha)." };
  const category = await getDb().kassaCategory.create({ data: { name: clean, type }, select: { id: true, name: true, type: true, icon: true } });
  revalidatePath("/admin/kassa", "layout");
  return { ok: true, category };
}

/** Settings: rename / archive / restore a category. */
export async function updateCategoryAction(form: FormData) {
  await requireRole("SUPER_ADMIN");
  const id = String(form.get("id") ?? ""), name = String(form.get("name") ?? "").trim();
  if (!id || !name || name.length > 60) return;
  await getDb().kassaCategory.update({ where: { id }, data: { name, archived: form.get("archived") === "on" } });
  revalidatePath("/admin/kassa", "layout");
}

/** "Boshlang‘ich qoldiq": USD and UZS separately, with its date. */
export async function saveOpeningAction(form: FormData) {
  await requireRole("SUPER_ADMIN");
  const amount = (key: string) => Number(String(form.get(key) ?? "0").replace(/[\s ]/g, "").replace(",", ".")), date = String(form.get("openingDate") ?? "");
  const data = { openingUsd: amount("openingUsd"), openingUzs: amount("openingUzs"), openingDate: new Date(`${date}T00:00:00Z`) };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(data.openingUsd) || !Number.isFinite(data.openingUzs) || Number.isNaN(data.openingDate.getTime())) return;
  await getDb().kassaSettings.upsert({ where: { id: "global" }, create: { id: "global", ...data }, update: data });
  revalidatePath("/admin/kassa", "layout");
}
