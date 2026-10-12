// Seh category flags (Prays → Kategoriyalar): which categories the workshop uses. Pure, for the tests and the browser.
//   "Zborkada ishlatiladi", name with "kondensator" → condenser list of the vazdushniy agregat (FN/FNV)
//   "Zborkada ishlatiladi", any other name         → compressor brand / model list of the zborka form
//   "Sehdan alohida chiqadi"                         → goods of the zapchast zayavkasi
// The role is read from the category name every time (a renamed category moves lists by itself).
// A flag is on the category, so it applies to all its products, including ones added later. Nothing is set automatically.
import { extractCondenserCode } from "../ai-office/product-agent-rules";

export const WORKSHOP_ROLES = ["COMPRESSOR", "CONDENSER"] as const;
export type WorkshopRole = (typeof WORKSHOP_ROLES)[number];
export const ROLE_LABELS: Record<WorkshopRole, string> = { COMPRESSOR: "Kompressor", CONDENSER: "Kondensator (FN/FNV)" };

/** workshopRole is only a record of the role at save time; roleOf() always reads it from the name. */
export type CategoryFlags = { id: string; name: string; workshopAssembly: boolean; workshopRole?: string | null; workshopIssue: boolean };
/** "FN/FNV kondensator Xitoy" → CONDENSER; every other name → COMPRESSOR. */
export const roleFromName = (name: string): WorkshopRole => /kondensator|конденсатор/i.test(name) ? "CONDENSER" : "COMPRESSOR";
export const roleOf = (category: Pick<CategoryFlags, "workshopAssembly" | "name"> | null | undefined): WorkshopRole | null =>
  category?.workshopAssembly ? roleFromName(category.name) : null;
export const isCompressorCategory = (category: Parameters<typeof roleOf>[0]) => roleOf(category) === "COMPRESSOR";
export const isCondenserCategory = (category: Parameters<typeof roleOf>[0]) => roleOf(category) === "CONDENSER";
export const isIssueCategory = (category: Pick<CategoryFlags, "workshopIssue"> | null | undefined) => !!category?.workshopIssue;
export const isWorkshopCategory = (category: (Pick<CategoryFlags, "workshopAssembly" | "workshopIssue">) | null | undefined) => !!category && (category.workshopAssembly || category.workshopIssue);

/** The values saved for a category: the role comes from its name (recorded only while "Zborkada ishlatiladi" is on). */
export function normalizeFlags(name: string, input: { workshopAssembly: boolean; workshopIssue: boolean }) {
  return { workshopAssembly: input.workshopAssembly, workshopRole: input.workshopAssembly ? roleFromName(name) : null, workshopIssue: input.workshopIssue };
}

/** "Zborkada ishlatiladi (Kompressor) · Sehdan alohida chiqadi" — the activity-history wording of a category's flags. */
export function flagsText(name: string, flags: { workshopAssembly: boolean; workshopIssue: boolean }) {
  const role = roleOf({ name, workshopAssembly: flags.workshopAssembly });
  const parts = [flags.workshopAssembly && `Zborkada ishlatiladi${role ? ` (${ROLE_LABELS[role]})` : ""}`, flags.workshopIssue && "Sehdan alohida chiqadi"].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Seh belgisi yo‘q";
}

// ---- Prays table filter --------------------------------------------------------------------------------
export const WORKSHOP_FILTERS = [
  { key: "all", label: "Hammasi" },
  { key: "workshop", label: "Seh tovarlari" },
  { key: "assembly", label: "Zborkada" },
  { key: "issue", label: "Alohida chiqadi" },
] as const;
export type WorkshopFilter = (typeof WORKSHOP_FILTERS)[number]["key"];
export function matchesWorkshopFilter(category: Pick<CategoryFlags, "workshopAssembly" | "workshopIssue"> | null | undefined, filter: WorkshopFilter) {
  if (filter === "all") return true;
  if (filter === "workshop") return isWorkshopCategory(category);
  if (filter === "assembly") return !!category?.workshopAssembly;
  return isIssueCategory(category);
}

// ---- Condensers (vazdushniy agregat) -------------------------------------------------------------------
export type CondenserProduct = { id: string; name: string; brand: string; model: string; basePriceUsd: number | null; categoryId: string | null };
export type Condenser = { id: string; code: string; label: string; source: string; categoryId: string; base: number };

/** "FN/FNV Xitoy" → "Xitoy", "FN/FNV UCS" → "UCS"; a category without the FN prefix keeps its name. */
export function categoryShortName(name: string) {
  const short = name.replace(/^\s*FNV?(?:\s*\/\s*FNV?)?\s*[-–—:·]?\s*/i, "").replace(/\b(?:vazdushniy\s+)?kondensator(?:lar|i)?\b/gi, "").replace(/\s{2,}/g, " ").replace(/^[\s\-–—:·]+|[\s\-–—:·]+$/g, "").trim();
  return short || name.trim();
}

/** Priced products of the condenser categories, each with its FN/FNV code: "FN160 · Xitoy". Without a code a product is skipped. */
export function condenserList(products: CondenserProduct[], categories: CategoryFlags[]): Condenser[] {
  const byId = new Map(categories.filter(isCondenserCategory).map(category => [category.id, category]));
  const out: Condenser[] = [];
  for (const product of products) {
    const category = product.categoryId ? byId.get(product.categoryId) : undefined;
    if (!category || product.basePriceUsd === null) continue;
    const code = extractCondenserCode(`${product.model} ${product.name}`);
    if (!code) continue;
    const source = categoryShortName(category.name) || product.brand;
    out.push({ id: product.id, code, label: `${code} · ${source}`, source, categoryId: category.id, base: product.basePriceUsd });
  }
  const number = (code: string) => Number(code.replace(/\D+/g, ""));
  return out.sort((a, b) => number(a.code) - number(b.code) || a.code.localeCompare(b.code) || a.source.localeCompare(b.source));
}

/** The standard condenser of a model: its FN code in the category chosen in the Prays settings (cheapest if there are two). */
export function standardCondenser(condensers: Condenser[], code: string | null | undefined, standardCategoryId: string | null | undefined) {
  if (!code || !standardCategoryId) return null;
  return condensers.filter(item => item.categoryId === standardCategoryId && item.code === code.toUpperCase()).sort((a, b) => a.base - b.base)[0] ?? null;
}

// ---- Zapchast zayavkasi: "Sehdan alohida chiqadi" goods -----------------------------------------------
export type IssueProduct = { id: string; name: string; model: string; basePriceUsd: number | null; categoryId: string | null };
export type IssueGroup = { categoryId: string; name: string; items: Array<{ id: string; label: string; basePriceUsd: number | null }> };
/** Goods of the issue categories, grouped by category (alphabetical), each group by name. */
export function issueGroups(products: IssueProduct[], categories: CategoryFlags[]): IssueGroup[] {
  const groups = new Map(categories.filter(isIssueCategory).map(category => [category.id, { categoryId: category.id, name: category.name, items: [] as IssueGroup["items"] }]));
  for (const product of products) {
    const group = product.categoryId ? groups.get(product.categoryId) : undefined;
    if (!group) continue;
    const label = product.model && !product.name.toUpperCase().includes(product.model.toUpperCase()) ? `${product.name} · ${product.model}` : product.name;
    group.items.push({ id: product.id, label, basePriceUsd: product.basePriceUsd });
  }
  return [...groups.values()].filter(group => group.items.length).map(group => ({ ...group, items: group.items.sort((a, b) => a.label.localeCompare(b.label)) })).sort((a, b) => a.name.localeCompare(b.name));
}
/** Search over the grouped goods (every word must match the name or the category). */
export function searchIssueGroups(groups: IssueGroup[], query: string) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return groups;
  return groups.map(group => ({ ...group, items: group.items.filter(item => words.every(word => `${item.label} ${group.name}`.toLowerCase().includes(word))) })).filter(group => group.items.length);
}
