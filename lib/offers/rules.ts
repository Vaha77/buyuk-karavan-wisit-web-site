// "Tijorat taklifi" (KP): client price = Prays price + markup %. Pure, tested; the server prices every save from the DB.
export const OFFER_VALID_DAYS = 7;
export const MAX_MARKUP = 500;
export const offerNumber = (number: number) => `KP-${String(number).padStart(4, "0")}`;
const cents = (value: number) => Math.round(value * 100) / 100;
/** Line name = model + name; a name that already contains the model is used as it is (no "DD 100 … DD 100 …"). */
export function offerTitle(model: string | null | undefined, name: string) {
  const m = (model ?? "").trim(), n = name.trim();
  return !m || n.toLowerCase().includes(m.toLowerCase()) ? n : `${m} ${n}`;
}

export type OfferLineInput = { productId: string; qty: number; markupPercent: number | null };
export type OfferItem = { productId: string; title: string; qty: number; baseUsd: number; markupPercent: number; priceUsd: number; sumUsd: number };

/** A line's own markup wins over the general one. Unknown product or bad numbers → an error text. */
export function priceOffer(lines: OfferLineInput[], products: Map<string, { title: string; baseUsd: number }>, generalMarkup: number): { ok: true; items: OfferItem[]; totalUsd: number } | { ok: false; error: string } {
  const okMarkup = (value: number) => Number.isFinite(value) && value >= 0 && value <= MAX_MARKUP;
  if (!okMarkup(generalMarkup)) return { ok: false, error: `Ustama 0–${MAX_MARKUP}% bo‘lsin.` };
  if (!lines.length || lines.length > 50) return { ok: false, error: "Kamida bitta mahsulot tanlang." };
  const items: OfferItem[] = [];
  for (const line of lines) {
    const product = products.get(line.productId);
    if (!product) return { ok: false, error: "Mahsulot Praysda topilmadi yoki narxi yo‘q." };
    if (!Number.isInteger(line.qty) || line.qty < 1 || line.qty > 9999) return { ok: false, error: "Sonini to‘g‘ri kiriting." };
    const markupPercent = line.markupPercent ?? generalMarkup;
    if (!okMarkup(markupPercent)) return { ok: false, error: `Ustama 0–${MAX_MARKUP}% bo‘lsin.` };
    const priceUsd = cents(product.baseUsd * (1 + markupPercent / 100));
    items.push({ productId: line.productId, title: product.title, qty: line.qty, baseUsd: product.baseUsd, markupPercent, priceUsd, sumUsd: cents(priceUsd * line.qty) });
  }
  return { ok: true, items, totalUsd: cents(items.reduce((sum, item) => sum + item.sumUsd, 0)) };
}

/** What the client sees (PDF): name, qty, price, sum — never the Prays price or the markup. */
export const publicLines = (items: OfferItem[]) => items.map(({ title, qty, priceUsd, sumUsd }) => ({ title, qty, priceUsd, sumUsd }));
