"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/require-admin";
import { getDb } from "@/lib/db";
import { DEBT_NOTES, parseDebtEntry, parseEmployee } from "@/lib/employees/rules";
import { diffEntry } from "@/lib/kassa/rules";

type Result = { ok: true } | { ok: false; error: string };

/** New hodim ("Hozirgi qarzi" becomes an OPENING row), or an edit / archive of one. */
export async function saveEmployeeAction(form: FormData): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await requireRole("SUPER_ADMIN");
  const parsed = parseEmployee(Object.fromEntries(form));
  if (!parsed.ok) return parsed;
  const id = String(form.get("id") ?? ""), db = getDb(), { data, opening } = parsed;
  if (id) { await db.employee.update({ where: { id }, data }); revalidatePath("/admin", "layout"); return { ok: true, id }; }
  const created = await db.$transaction(async tx => {
    const employee = await tx.employee.create({ data });
    if (opening) {
      const values = { employeeId: employee.id, type: "OPENING" as const, amountUsd: opening, note: DEBT_NOTES.OPENING };
      const row = await tx.employeeDebtEntry.create({ data: { ...values, createdById: user.id } });
      await tx.employeeDebtLog.create({ data: { entryId: row.id, userId: user.id, changes: diffEntry({}, values) } });
    }
    return employee;
  });
  revalidatePath("/admin", "layout");
  return { ok: true, id: created.id };
}

/** A hand-written row, never touching the kassa; a row that came from the kassa is corrected only there. */
export async function saveDebtEntryAction(form: FormData): Promise<Result> {
  const user = await requireRole("SUPER_ADMIN");
  const parsed = parseDebtEntry(Object.fromEntries(form));
  if (!parsed.ok) return parsed;
  const id = String(form.get("id") ?? ""), employeeId = String(form.get("employeeId") ?? ""), db = getDb(), data = parsed.data;
  if (!id) {
    if (!await db.employee.findUnique({ where: { id: employeeId } })) return { ok: false, error: "Hodim topilmadi." };
    await db.$transaction(async tx => {
      const row = await tx.employeeDebtEntry.create({ data: { ...data, employeeId, createdById: user.id } });
      await tx.employeeDebtLog.create({ data: { entryId: row.id, userId: user.id, changes: diffEntry({}, data) } });
    });
  } else {
    const row = await db.employeeDebtEntry.findFirst({ where: { id, deletedAt: null, kassaEntryId: null } });
    if (!row) return { ok: false, error: "Yozuv topilmadi." };
    const changes = diffEntry({ ...row, amountUsd: Number(row.amountUsd) }, data);
    if (Object.keys(changes).length) await db.$transaction(async tx => {
      await tx.employeeDebtEntry.update({ where: { id }, data });
      await tx.employeeDebtLog.create({ data: { entryId: id, userId: user.id, changes } });
    });
  }
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function deleteDebtEntryAction(id: string, reason: string): Promise<Result> {
  const user = await requireRole("SUPER_ADMIN");
  const at = new Date(), deleteReason = String(reason ?? "").trim().slice(0, 200) || null;
  const done = await getDb().$transaction(async tx => {
    const { count } = await tx.employeeDebtEntry.updateMany({ where: { id: String(id), deletedAt: null, kassaEntryId: null }, data: { deletedAt: at, deletedById: user.id, deleteReason } });
    if (count) await tx.employeeDebtLog.create({ data: { entryId: String(id), userId: user.id, changes: { deletedAt: [null, at.toISOString()], deleteReason: [null, deleteReason] } } });
    return count === 1;
  });
  if (!done) return { ok: false, error: "Yozuv topilmadi." };
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function restoreDebtEntryAction(id: string): Promise<Result> {
  const user = await requireRole("SUPER_ADMIN");
  const db = getDb(), row = await db.employeeDebtEntry.findFirst({ where: { id: String(id), deletedAt: { not: null }, kassaEntryId: null } });
  if (!row?.deletedAt) return { ok: false, error: "Yozuv topilmadi." };
  const deletedAt = row.deletedAt;
  await db.$transaction(async tx => {
    await tx.employeeDebtEntry.update({ where: { id: row.id }, data: { deletedAt: null, deletedById: null, deleteReason: null } });
    await tx.employeeDebtLog.create({ data: { entryId: row.id, userId: user.id, changes: { deletedAt: [deletedAt.toISOString(), null], deleteReason: [row.deleteReason, null] } } });
  });
  revalidatePath("/admin", "layout");
  return { ok: true };
}
