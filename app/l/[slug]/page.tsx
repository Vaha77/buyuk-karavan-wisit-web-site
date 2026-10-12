import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Footer } from "@/components/home/home-page";
import { LeadLanding, type LandingContacts } from "@/components/landing/lead-landing";
import "@/components/products/products.css";
import "@/components/products/product-detail.css";
import "@/components/landing/lead-landing.css";
import { getUsdUzsRate } from "@/lib/currency/cbu";
import { getPublicHomeContent } from "@/lib/home/content";
import { formatUzs, usdToSellingUzs } from "@/lib/pricing/money";
import { getProductBySlug, getRelatedProducts } from "@/lib/products/queries";
import { priceTimingOf } from "@/lib/referrals/rules";
import { HANDOFF_PARAM, parseHandoff } from "@/lib/referrals/tracking";

/**
 * Lead page: /l/<product slug> (price after the form) or /l/<product slug>?narx=oldin (price shown first). Opened from
 * /r/<link> when the link's target is "Lid sahifasi (forma tepada)"; the _bk hand-off is kept for attribution.
 */
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await getProductBySlug((await params).slug);
  if (!product) return { title: "Mahsulot topilmadi" };
  const title = `${product.name} ${product.model} — narxini bilish | BUYUK KARAVAN`;
  // An ad landing page: the product page stays the indexed one.
  return { title, description: product.shortDescription || `${product.name} ${product.model}: narxini bilish uchun ma’lumot qoldiring.`, alternates: { canonical: `/products/${encodeURIComponent(product.slug)}` }, robots: { index: false, follow: true } };
}

const DEFAULT_PHONE = "+998 91 637 77 77";

export default async function LeadPage({ params, searchParams }: Props) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const product = await getProductBySlug(slug);
  if (!product) notFound();
  const [related, rate, content] = await Promise.all([getRelatedProducts(product.id, product.category).catch(() => []), getUsdUzsRate(), getPublicHomeContent().catch(() => null)]);
  const uzs = product.priceUsd && rate ? usdToSellingUzs(product.priceUsd, rate.rate) : null;
  const footer = content?.footer;
  const phone = footer?.phone && !footer.phone.includes("[") ? footer.phone : DEFAULT_PHONE;
  const telegram = footer?.telegram && !footer.telegram.includes("[") ? `https://t.me/${footer.telegram.replace(/^@/, "")}` : null;
  const contacts: LandingContacts = { phone: { label: phone, href: `tel:${phone.replace(/[^+\d]/g, "")}` }, telegram };
  const handoffValue = typeof query[HANDOFF_PARAM] === "string" ? query[HANDOFF_PARAM] : null;
  return <div className="products-shell landing-page">
    <LeadLanding product={product} related={related.slice(0, 8)} exchangeRate={rate?.rate ?? null} priceText={uzs === null ? null : formatUzs(uzs)} priceUzs={uzs === null ? null : Number(uzs)} showPriceFirst={priceTimingOf(query.narx) === "before"} handoff={parseHandoff(handoffValue) ? handoffValue : null} contacts={contacts}/>
    <Footer onProducts/>
  </div>;
}
