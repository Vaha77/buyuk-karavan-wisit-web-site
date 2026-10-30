"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/require-admin";
import { getDb } from "@/lib/db";
import { kassaBot } from "@/lib/kassa/bot";
import { entryFromDraft } from "@/lib/kassa/bot-core";
import { deleteKassaDebt, debtTypeOf, restoreKassaDebt, syncKassaDebt } from "@/lib/employees/rules";
import { diffEntry, parseEntry } from "@/lib/kassa/rules";
import { ProjectImageError, uploadProjectImage } from "@/lib/projects/storage";

export type KassaResult = { ok: true } | { ok: false; error: string };

/** New entry, or a correction of an existing one (never a delete): each correction logs the changed fields. */
export async function saveEntryAction(form: FormData): Promise<KassaResult> {
  const user = await requireRole("SUPER_ADMIN");
  const parsed = parseEntry(Object.fromEntries(form));
  if (!parsed.ok) return parsed;
  const id = String(form.get("id") ?? ""), data = parsed.data, db = getDb();
  const [category, entry, employee, linked] = await Promise.all([db.kassaCategory.findUnique({ where: { id: data.categoryId } }), id ? db.kassaEntry.findFirst({ where: { id, deletedAt: null } }) : null, data.employeeId ? db.employee.findUnique({ where: { id: data.employeeId } }) : null, id ? db.employeeDebtEntry.findUnique({ where: { kassaEntryId: id }, select: { deletedAt: true } }) : null]);
  if (id && !entry) return { ok: false, error: "Yozuv topilmadi." };
  if (!category || category.type !== data.type || (category.archived && entry?.categoryId !== category.id)) return { ok: false, error: "Kategoriyani tanlang." };
  if (data.employeeId && (!employee || (employee.archived && entry?.employeeId !== employee.id))) return { ok: false, error: "Hodimni tanlang." };
  const addToDebt = form.get("addToDebt") === "on";
  const photo = form.get("receipt");
  let receiptUrl: string | undefined;
  if (photo instanceof File && photo.size > 0) {
    try { receiptUrl = await uploadProjectImage("kassa", photo); }
    catch (error) { return { ok: false, error: error instanceof ProjectImageError ? error.message : "Rasm yuklanmadi." }; }
  }
  const values = { ...data, ...(receiptUrl && { receiptUrl }) };
  // "Saqlash" in the sheet opened by ✏️ on a bot draft works like its ✓.
  const draftId = String(form.get("draftId") ?? "");
  if (draftId) { const result = await kassaBot().confirmDraft(draftId, user.id, values, addToDebt); if (result.ok) revalidatePath("/admin", "layout"); return result; }
  if (!entry) await db.$transaction(async tx => { const created = await tx.kassaEntry.create({ data: { ...values, createdById: user.id } }); await tx.kassaEntryLog.create({ data: { entryId: created.id, userId: user.id, changes: diffEntry({}, values) } }); await syncKassaDebt(tx, { ...values, id: created.id }, addToDebt, user.id); });
  else {
    // "debt" logs the toggle; every field the debt row depends on is in this diff, so an unchanged save writes nothing.
    const changes = diffEntry({ ...entry, amount: Number(entry.amount), debt: !!linked && !linked.deletedAt }, { ...values, debt: !!debtTypeOf(values, addToDebt) });
    if (Object.keys(changes).length) await db.$transaction(async tx => { await tx.kassaEntry.update({ where: { id }, data: values }); await tx.kassaEntryLog.create({ data: { entryId: id, userId: user.id, changes } }); await syncKassaDebt(tx, { ...values, id }, addToDebt, user.id); });
  }
  revalidatePath("/admin", "layout");
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

/** Soft delete: the entry leaves lists, balances, the report and Excel at once; logged, and "Tiklash" brings it back. */
export async function deleteEntryAction(id: string, reason: string): Promise<KassaResult> {
  const user = await requireRole("SUPER_ADMIN");
  const db = getDb(), at = new Date(), deleteReason = String(reason ?? "").trim().slice(0, 200) || null;
  const done = await db.$transaction(async tx => {
    const { count } = await tx.kassaEntry.updateMany({ where: { id: String(id), deletedAt: null }, data: { deletedAt: at, deletedById: user.id, deleteReason } });
    if (count) await tx.kassaEntryLog.create({ data: { entryId: String(id), userId: user.id, changes: { deletedAt: [null, at.toISOString()], deleteReason: [null, deleteReason] } } });
    if (count) await deleteKassaDebt(tx, String(id), at, user.id, deleteReason);
    return count === 1;
  });
  if (!done) return { ok: false, error: "Yozuv topilmadi." };
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function restoreEntryAction(id: string): Promise<KassaResult> {
  const user = await requireRole("SUPER_ADMIN");
  const db = getDb(), entry = await db.kassaEntry.findFirst({ where: { id: String(id), deletedAt: { not: null } } });
  if (!entry?.deletedAt) return { ok: false, error: "Yozuv topilmadi." };
  const deletedAt = entry.deletedAt;
  await db.$transaction(async tx => {
    await tx.kassaEntry.update({ where: { id: entry.id }, data: { deletedAt: null, deletedById: null, deleteReason: null } });
    await tx.kassaEntryLog.create({ data: { entryId: entry.id, userId: user.id, changes: { deletedAt: [deletedAt.toISOString(), null], deleteReason: [entry.deleteReason, null] } } });
    await restoreKassaDebt(tx, entry.id, deletedAt, user.id);
  });
  revalidatePath("/admin", "layout");
  return { ok: true };
}

/** Bot drafts: ✓ (one entry, once), ✕, and "Hammasini tasdiqlash" (only drafts without flags). */
export async function confirmDraftAction(id: string): Promise<KassaResult> {
  const user = await requireRole("SUPER_ADMIN");
  const result = await kassaBot().confirmDraft(String(id), user.id);
  revalidatePath("/admin", "layout");
  return result;
}

export async function cancelDraftAction(id: string): Promise<KassaResult> {
  await requireRole("SUPER_ADMIN");
  const done = await kassaBot().cancelDraft(String(id));
  revalidatePath("/admin", "layout");
  return done ? { ok: true } : { ok: false, error: "Bu yozuv allaqachon ko‘rib chiqilgan." };
}

export async function confirmAllDraftsAction(): Promise<KassaResult> {
  const user = await requireRole("SUPER_ADMIN");
  const bot = kassaBot(), drafts = await getDb().kassaDraft.findMany({ where: { status: "PENDING" }, orderBy: { occurredAt: "asc" } });
  for (const draft of drafts.filter(item => entryFromDraft(item))) await bot.confirmDraft(draft.id, user.id);
  revalidatePath("/admin", "layout");
  return { ok: true };
}
