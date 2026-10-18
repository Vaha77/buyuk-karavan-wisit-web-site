"use server";

import { revalidatePath } from "next/cache";
import { requireSeller } from "@/lib/auth/require-admin";
import { saveOffer, sendOfferToTelegram, type OfferInput } from "@/lib/offers/service";

export type OfferActionResult = { ok: true; id?: string } | { ok: false; error: string };
const text = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const num = (value: unknown) => typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));

/** Prices are computed in saveOffer from the Prays; only ids, quantities and markups come from the form. */
export async function saveOfferAction(input: OfferInput): Promise<OfferActionResult> {
  const { user } = await requireSeller();
  try {
    const lines = Array.isArray(input?.lines) ? input.lines.slice(0, 50).map(line => ({ productId: text(line?.productId, 40), qty: num(line?.qty), markupPercent: line?.markupPercent === null || line?.markupPercent === undefined || String(line.markupPercent) === "" ? null : num(line.markupPercent) })) : [];
    const result = await saveOffer(user, { customerId: text(input?.customerId, 40) || null, customerName: text(input?.customerName, 120), customerPhone: text(input?.customerPhone, 40), markupPercent: num(input?.markupPercent), lines });
    if (result.ok) revalidatePath("/admin/my/offers");
    return result;
  } catch (error) {
    console.error("[OfferSave]", { name: error instanceof Error ? error.name : "UnknownError" });
    return { ok: false, error: "Saqlab bo‘lmadi. Qayta urinib ko‘ring." };
  }
}

export async function sendOfferTelegramAction(id: string): Promise<OfferActionResult> {
  const { user } = await requireSeller();
  try { return await sendOfferToTelegram(user, text(id, 40)); }
  catch (error) {
    console.error("[OfferTelegram]", { name: error instanceof Error ? error.name : "UnknownError" });
    return { ok: false, error: "Telegramga yuborilmadi. Qayta urinib ko‘ring." };
  }
}
