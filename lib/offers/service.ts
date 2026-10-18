import "server-only";
import type { AdminUser, Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { getPraysProducts } from "@/lib/prays/queries";
import { getCustomer } from "@/lib/customers/seller-repo";
import { viewerOf } from "@/lib/customers/seller-service";
import { sellerChat } from "@/lib/customers/seller-telegram";
import { sendDocument } from "@/lib/telegram/client";
import { OFFER_VALID_DAYS, offerNumber, offerTitle, priceOffer, publicLines, type OfferItem, type OfferLineInput } from "./rules";
import { renderOfferPdf } from "./offer-pdf";

type Seller = Pick<AdminUser, "id" | "name" | "role" | "salesPersonId">;
const day = (date: Date) => date.toISOString().slice(0, 10).split("-").reverse().join(".");

/** Priced Prays products for the offer form, by category. */
export async function offerProducts() {
  return (await getPraysProducts()).filter(product => product.basePriceUsd !== null && product.basePriceUsd > 0)
    .map(product => ({ id: product.id, title: offerTitle(product.model, product.name), category: product.categoryName ?? "Boshqa", baseUsd: product.basePriceUsd! }));
}

export type OfferInput = { customerId: string | null; customerName: string; customerPhone: string; markupPercent: number; lines: OfferLineInput[] };
/** Prices come from the DB here, never from the browser. A customer id must be the seller's own customer. */
export async function saveOffer(seller: Seller, input: OfferInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const customer = input.customerId ? await getCustomer(getDb(), viewerOf(seller), input.customerId) : null;
  if (input.customerId && !customer) return { ok: false, error: "Mijoz topilmadi." };
  const name = (customer?.name ?? input.customerName).trim().slice(0, 120), phone = (customer ? customer.phoneNormalized ?? customer.phone : input.customerPhone)?.trim().slice(0, 40) || null;
  if (name.length < 2) return { ok: false, error: "Mijoz ismini kiriting." };
  const products = new Map((await offerProducts()).map(product => [product.id, product]));
  const priced = priceOffer(input.lines, products, input.markupPercent);
  if (!priced.ok) return priced;
  const validUntil = new Date(Date.now() + OFFER_VALID_DAYS * 86_400_000);
  const offer = await getDb().commercialOffer.create({ data: { sellerId: seller.id, customerId: customer?.id ?? null, customerName: name, customerPhone: phone, markupPercent: input.markupPercent, items: priced.items as unknown as Prisma.InputJsonValue, totalUsd: priced.totalUsd, validUntil }, select: { id: true } });
  return { ok: true, id: offer.id };
}

export async function listOffers(seller: Pick<AdminUser, "id">) {
  const rows = await getDb().commercialOffer.findMany({ where: { sellerId: seller.id }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, number: true, customerName: true, totalUsd: true, createdAt: true, validUntil: true } });
  return rows.map(row => ({ id: row.id, number: offerNumber(row.number), customerName: row.customerName, totalUsd: Number(row.totalUsd), date: day(row.createdAt), validUntil: day(row.validUntil) }));
}

/** The seller's own offer (null otherwise), for copying into a new one. */
export async function getOffer(seller: Pick<AdminUser, "id">, id: string) {
  const offer = await getDb().commercialOffer.findFirst({ where: { id, sellerId: seller.id }, select: { id: true, number: true, customerId: true, customerName: true, customerPhone: true, markupPercent: true, items: true, totalUsd: true, createdAt: true, validUntil: true, seller: { select: { name: true, phone: true } } } });
  return offer && { ...offer, items: offer.items as unknown as OfferItem[], markupPercent: Number(offer.markupPercent), totalUsd: Number(offer.totalUsd) };
}

export async function offerPdf(seller: Pick<AdminUser, "id">, id: string) {
  const offer = await getOffer(seller, id);
  if (!offer) return null;
  const number = offerNumber(offer.number);
  const buffer = await renderOfferPdf({ number, date: day(offer.createdAt), validUntil: day(offer.validUntil), customerName: offer.customerName, customerPhone: offer.customerPhone, lines: publicLines(offer.items), totalUsd: offer.totalUsd, sellerName: offer.seller.name, sellerPhone: offer.seller.phone });
  return { buffer, filename: `${number}.pdf`, number, customerName: offer.customerName };
}

/** The PDF to the seller's own chat; they forward it to the client. */
export async function sendOfferToTelegram(seller: Pick<AdminUser, "id">, id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const chat = await sellerChat({ userId: seller.id });
  if (!chat) return { ok: false, error: "Telegram ulanmagan — Dashboard’da “Telegram’ni ulang” ni bosing." };
  const file = await offerPdf(seller, id);
  if (!file) return { ok: false, error: "Taklif topilmadi." };
  await sendDocument(chat, file.buffer, file.filename, `${file.number} · ${file.customerName}`);
  return { ok: true };
}
