"use server";

import { redirect } from "next/navigation";
import { createProduct, updateProduct, deleteProduct, toggleProductVisibility, copyProduct, DuplicateSlugError, ProductNotFoundError } from "@/lib/products/mutations";
import { validateProductInput } from "@/lib/products/validation";
import { requireAdmin } from "@/lib/auth/require-admin";

type ActionResult = { error?: string };

function message(error: unknown): string {
  if (error instanceof DuplicateSlugError) return "Bu URL slug boshqa mahsulotda ishlatilgan.";
  if (error instanceof ProductNotFoundError) return "Mahsulot topilmadi.";
  return "Saqlashda xatolik yuz berdi. Keyinroq qayta urinib ko‘ring.";
}

export async function saveProductAction(id: string | null, raw: unknown): Promise<ActionResult> {
  await requireAdmin();
  const parsed = validateProductInput(raw);
  if (!parsed.success) return { error: parsed.error };
  try {
    if (id) await updateProduct(id, parsed.data);
    else await createProduct(parsed.data);
  } catch (error) {
    return { error: message(error) };
  }
  redirect(`/admin/products?saved=${id ? "updated" : "created"}`);
}

export async function deleteProductAction(id: string): Promise<ActionResult> {
  await requireAdmin();
  try { await deleteProduct(id); return {}; }
  catch (error) { return { error: message(error) }; }
}

export async function toggleVisibilityAction(id: string): Promise<ActionResult> {
  await requireAdmin();
  try { await toggleProductVisibility(id); return {}; }
  catch (error) { return { error: message(error) }; }
}

export async function copyProductAction(id: string): Promise<ActionResult> {
  await requireAdmin();
  try { await copyProduct(id); return {}; }
  catch (error) { return { error: message(error) }; }
}
