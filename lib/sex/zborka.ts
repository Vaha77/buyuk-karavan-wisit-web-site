// Zborka buyurtmasi pricing, built only from Prays data (never hard-coded tables). Pure, for the tests and the browser.
//   compressors          = products whose category is "Zborkada ishlatiladi · Kompressor" (Prays → Kategoriyalar)
//   water condenser (HP) = vadinoy agregat − R/B ustida
//   air condenser (FN)   = chosen condenser's Prays price − the standard one's (standard condenser category in Prays)
//   receiver (L)         = SexPart "Resiver bachok {L}"      price = standard + Σ(chosen part − standard part)
//   chiller              = no ready scheme: the seller writes the composition; the price is typed or "kelishiladi"
import { litersOf, normalizeBrand, productFeatures } from "../prays/rules";
import { condenserList, isCompressorCategory, standardCondenser, type CategoryFlags, type Condenser } from "./categories";

export type ZborkaProduct = { id: string; name: string; brand: string; model: string; categoryName: string | null; categoryId?: string | null; basePriceUsd: number | null };
export type ZborkaPart = { id: string; name: string; size: string | null; group: string; basePriceUsd: number | null };
export type Assembly = "k" | "rb" | "vd" | "vz" | "ch";
export const ASSEMBLIES: Array<{ key: Assembly; name: string; sub: string }> = [
  { key: "k", name: "Kompressor o‘zi", sub: "faqat kompressor" },
  { key: "rb", name: "Resiver bachok ustida", sub: "kompressor + resiver" },
  { key: "vd", name: "Vadinoy agregat", sub: "+ suvli kondensator" },
  { key: "vz", name: "Vazdushniy agregat", sub: "+ FN kondensator, rama" },
  { key: "ch", name: "Chiller", sub: "tarkibi qo‘lda yoziladi" },
];
type Priced = { id: string; name: string; base: number };
export type ZborkaModel = { key: string; model: string; k: Priced | null; rb: Priced | null; vd: Priced | null; vz: Priced | null; liters: string | null; hp: string | null; fn: string | null };
export type ZborkaGroup = { key: string; label: string; brand: string; models: ZborkaModel[]; hpTable: Record<string, number> };
/** notice: why the compressor list is empty (no category flagged yet). */
export type ZborkaCatalog = { groups: ZborkaGroup[]; receivers: Record<string, number>; condensers: Condenser[]; standardCondenserCategoryId: string | null; notice: string | null };
export type ZborkaOptions = { categories?: CategoryFlags[]; standardCondenserCategoryId?: string | null };
export const NO_COMPRESSOR_CATEGORIES = "Prays → Kategoriyalar’da “Zborkada ishlatiladi · Kompressor” belgili kategoriya yo‘q — Super Admin belgilaydi.";

/** Most frequent difference; a tie goes to the smaller value (FN120: 1016 vs 1017 → 1016). */
export function modeValue(values: number[]) {
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? null;
}
const byNumber = (a: string, b: string) => Number(a.replace(/\D+/g, "")) - Number(b.replace(/\D+/g, "")) || a.localeCompare(b);
const titleCase = (brand: string) => brand.length > 3 && brand === brand.toUpperCase() && brand !== "XUEYING" ? brand.charAt(0) + brand.slice(1).toLowerCase() : brand;

const slotOf = (kind: string) => kind === "compressor" ? "k" : kind === "receiver" ? "rb" : kind === "water" ? "vd" : kind === "air" ? "vz" : null;

/**
 * Price lists ("Bitzer R22", "XUEYING", "Briliant R404"…) with each compressor's standard assemblies and the part tables.
 * With `options.categories` only models that have a product in a "Kompressor" category are offered (their R/B, vadinoy
 * and vazdushniy rows may sit in any category); air coolers (DD/DJ) and other goods never become a compressor.
 */
export function buildZborkaCatalog(products: ZborkaProduct[], parts: ZborkaPart[], options: ZborkaOptions = {}): ZborkaCatalog {
  const gated = !!options.categories;
  const compressorIds = new Set((options.categories ?? []).filter(isCompressorCategory).map(category => category.id));
  const identity = (product: ZborkaProduct) => { const f = productFeatures(product); return { f, id: `${normalizeBrand(product.brand)}|${f.freon ?? ""}|${f.modelKey}` }; };
  const allowed = new Set(products.filter(product => product.categoryId && compressorIds.has(product.categoryId)).map(product => identity(product).id));
  const groups = new Map<string, { brand: string; label: string; models: Map<string, ZborkaModel> }>();
  for (const product of products) {
    if (product.basePriceUsd === null) continue;
    const { f, id } = identity(product);
    const slot = slotOf(f.kind);
    if (!slot || !f.modelKey || (gated && !allowed.has(id))) continue;
    const brand = normalizeBrand(product.brand), key = `${brand}|${f.freon ?? ""}`;
    const group = groups.get(key) ?? { brand, label: [titleCase(product.brand.trim()), f.freon].filter(Boolean).join(" "), models: new Map() };
    groups.set(key, group);
    const model = group.models.get(f.modelKey) ?? { key: f.modelKey, model: product.model.trim() || f.modelKey, k: null, rb: null, vd: null, vz: null, liters: null, hp: null, fn: null };
    group.models.set(f.modelKey, model);
    // Two products in one slot (e.g. 8 L and 20 L receiver): the cheaper one is the standard.
    const current = model[slot];
    if (current && current.base <= product.basePriceUsd) continue;
    model[slot] = { id: product.id, name: product.name, base: product.basePriceUsd };
    if (slot === "rb") model.liters = f.liters;
    if (slot === "vd") model.hp = f.hp;
    if (slot === "vz") model.fn = f.fn;
  }
  const result: ZborkaGroup[] = [...groups.entries()].map(([key, group]) => {
    const models = [...group.models.values()].filter(model => model.k || model.rb || model.vd || model.vz);
    const diffs = (pick: (model: ZborkaModel) => [string | null, Priced | null]) => {
      const values = new Map<string, number[]>();
      for (const model of models) { const [code, product] = pick(model); if (code && product && model.rb) values.set(code, [...(values.get(code) ?? []), Math.round((product.base - model.rb.base) * 100) / 100]); }
      return Object.fromEntries([...values.entries()].sort((a, b) => byNumber(a[0], b[0])).map(([code, list]) => [code, modeValue(list)!]));
    };
    models.sort((a, b) => (a.k?.base ?? a.rb?.base ?? 0) - (b.k?.base ?? b.rb?.base ?? 0) || a.key.localeCompare(b.key));
    return { key, label: group.label, brand: group.brand, models, hpTable: diffs(model => [model.hp, model.vd]) };
  }).filter(group => group.models.length).sort((a, b) => a.label.localeCompare(b.label));
  const receivers: Record<string, number> = {};
  for (const part of parts) {
    if (part.basePriceUsd === null || !/resiver|receiver/i.test(`${part.group} ${part.name}`)) continue;
    const liters = litersOf(`${part.size ?? ""} ${part.name}`) ?? part.size?.match(/^\s*(\d+(?:[.,]\d+)?)\s*$/)?.[1]?.replace(",", ".");
    if (liters && receivers[liters] === undefined) receivers[liters] = part.basePriceUsd;
  }
  const condensers = options.categories ? condenserList(products.map(product => ({ ...product, categoryId: product.categoryId ?? null })), options.categories) : [];
  return {
    groups: result, receivers: Object.fromEntries(Object.entries(receivers).sort((a, b) => byNumber(a[0], b[0]))),
    condensers, standardCondenserCategoryId: options.standardCondenserCategoryId ?? null,
    notice: gated && !compressorIds.size ? NO_COMPRESSOR_CATEGORIES : null,
  };
}

/** Why the condenser of a vazdushniy agregat cannot be changed (no standard category, or no price for this FN code). */
export function condenserWarning(model: Pick<ZborkaModel, "fn">, catalog: Pick<ZborkaCatalog, "condensers" | "standardCondenserCategoryId">) {
  if (!model.fn) return null;
  if (!catalog.standardCondenserCategoryId) return "Standart kondensator kategoriyasi tanlanmagan (Prays → Kategoriyalar) — kondensatorni almashtirib bo‘lmaydi.";
  return standardCondenser(catalog.condensers, model.fn, catalog.standardCondenserCategoryId) ? null : `Standart kondensator ${model.fn} narxi praysda topilmadi — almashtirib bo‘lmaydi.`;
}

/** condenserId: a condenser product (vazdushniy); composition / manualPrice: chiller (null price = "kelishiladi"). */
export type ZborkaChoice = { assembly: Assembly; liters?: string | null; hp?: string | null; condenserId?: string | null; composition?: string | null; manualPrice?: number | null };
export type ZborkaChange = { part: "receiver" | "water" | "air"; label: string; chosen: string; standard: string; delta: number };
export type ZborkaQuote = { ok: true; title: string; base: number; standard: number; negotiated: boolean; frameChanged?: boolean; product: Priced; changes: ZborkaChange[]; lines: Array<{ k: string; v: string }>; telegram: string[]; options: { liters: string; hp: string; fn: string; condenserId: string | null; condenser: string | null; composition: string | null } } | { ok: false; error: string };
type QuoteCatalog = Pick<ZborkaCatalog, "receivers"> & Partial<Pick<ZborkaCatalog, "condensers" | "standardCondenserCategoryId">>;

/** Chiller: the model's compressor and the seller's composition; price typed by the seller or "kelishiladi". */
function quoteChiller(model: ZborkaModel, brand: string, choice: ZborkaChoice): ZborkaQuote {
  const product = model.k ?? model.rb ?? model.vd ?? model.vz;
  if (!product) return { ok: false, error: "Kompressor praysda topilmadi." };
  const composition = choice.composition?.trim() ?? "";
  if (composition.length < 3) return { ok: false, error: "Chiller tarkibini yozing (tayyor sxema yo‘q)." };
  const manual = choice.manualPrice ?? null;
  if (manual !== null && (!Number.isFinite(manual) || manual <= 0 || manual > 1_000_000)) return { ok: false, error: "Chiller narxini to‘g‘ri kiriting yoki bo‘sh qoldiring (kelishiladi)." };
  const base = manual === null ? 0 : Math.round(manual * 100) / 100;
  return {
    ok: true, title: `Chiller · ${brand} ${model.model}`, base, standard: base, negotiated: manual === null, product, changes: [],
    lines: [{ k: "Kompressor", v: `${brand} ${model.model}` }, { k: "Tarkibi", v: composition }],
    telegram: ["Chiller — tayyor sxema yo‘q", `Tarkibi: ${composition}`],
    options: { liters: "", hp: "", fn: "", condenserId: null, condenser: null, composition },
  };
}

/** Condenser series = the letters of its code ("FN160" → "FN", "FNV200" → "FNV"); another series needs another frame. */
export const condenserSeries = (code: string | null | undefined) => (code ?? "").toUpperCase().match(/^[A-Z]+/)?.[0] ?? "";

/** Price and description of one configured assembly. A part can only be swapped when both its prices are known. */
export function quoteZborka(model: ZborkaModel, group: Pick<ZborkaGroup, "label" | "hpTable" | "brand">, catalog: QuoteCatalog, choice: ZborkaChoice): ZborkaQuote {
  const receivers = catalog.receivers;
  if (choice.assembly === "ch") return quoteChiller(model, group.brand, choice);
  const product = model[choice.assembly];
  if (!product) return { ok: false, error: "Bu yig‘ma turi uchun praysda narx yo‘q." };
  const brand = group.brand, changes: ZborkaChange[] = [], lines = [{ k: "Kompressor", v: `${brand} ${model.model}` }], telegram: string[] = [];
  let base = product.base;
  const liters = choice.assembly === "k" ? "" : choice.liters || model.liters || "", hp = choice.hp || model.hp || "";
  let fn = model.fn || "", condenserId: string | null = null, condenser: string | null = null, frameChanged = false;
  if (choice.assembly !== "k") {
    if (liters !== (model.liters ?? "")) {
      const chosen = receivers[liters], standard = model.liters ? receivers[model.liters] : undefined;
      if (chosen === undefined || standard === undefined) return { ok: false, error: "Resiver narxi kiritilmagan" };
      changes.push({ part: "receiver", label: "Resiver", chosen: `${liters} L`, standard: `${model.liters} L`, delta: chosen - standard }); base += chosen - standard;
    }
    lines.push({ k: "Resiver", v: liters ? `${liters} L` : "standart" });
    telegram.push(`Resiver: ${liters ? `${liters} L` : "standart"}${liters !== (model.liters ?? "") ? ` (standart ${model.liters} L o‘rniga)` : ""}`);
  }
  let title = `${brand} ${model.model} kompressor`;
  if (choice.assembly === "rb") title = `${brand} ${model.model} resiver ustida${liters ? ` ${liters}L` : ""}`;
  if (choice.assembly === "vd") {
    if (hp !== (model.hp ?? "")) {
      const chosen = group.hpTable[hp], standard = model.hp ? group.hpTable[model.hp] : undefined;
      if (chosen === undefined || standard === undefined) return { ok: false, error: "Vadinoy kondensator narxi topilmadi" };
      changes.push({ part: "water", label: "Vadinoy kondensator", chosen: `${hp} HP`, standard: `${model.hp} HP`, delta: chosen - standard }); base += chosen - standard;
    }
    lines.push({ k: "Vadinoy kondensator", v: hp ? `${hp} HP` : "standart" });
    telegram.push(`Vadinoy kondensator: ${hp ? `${hp} HP` : "standart"}${hp !== (model.hp ?? "") ? ` (standart ${model.hp} HP o‘rniga)` : ""}`);
    title = `${brand} ${model.model} vadinoy agregat${hp ? ` · ${hp}HP` : ""}`;
  }
  if (choice.assembly === "vz") {
    // Prays prices of real condenser products: delta = chosen − standard (the standard category from the Prays settings).
    const condensers = catalog.condensers ?? [], standard = standardCondenser(condensers, model.fn, catalog.standardCondenserCategoryId);
    const chosen = choice.condenserId ? condensers.find(item => item.id === choice.condenserId) : null;
    if (choice.condenserId && !chosen) return { ok: false, error: "Kondensator praysda topilmadi." };
    const changed = !!chosen && chosen.id !== standard?.id;
    if (changed) {
      if (!standard) return { ok: false, error: `Standart kondensator${model.fn ? ` ${model.fn}` : ""} narxi praysda topilmadi — almashtirib bo‘lmaydi.` };
      changes.push({ part: "air", label: "Kondensator", chosen: chosen!.label, standard: standard.label, delta: chosen!.base - standard.base }); base += chosen!.base - standard.base;
    }
    const shown = chosen ?? standard;
    fn = shown?.code ?? fn; condenserId = shown?.id ?? null; condenser = shown?.label ?? (model.fn || null);
    lines.push({ k: "Kondensator", v: condenser ? `${condenser} + rama` : "standart" });
    telegram.push(`Kondensator: ${condenser || "standart"}${changed ? ` (standart ${standard!.label} o‘rniga)` : ""}, rama bilan`);
    // The price list has no frame price per series: the seller adds it, the price itself stays as calculated.
    frameChanged = changed && condenserSeries(chosen!.code) !== condenserSeries(standard!.code);
    if (frameChanged) telegram.push("Rama narxi qo‘shilmagan (kondensator turi o‘zgargan)");
    title = `${brand} ${model.model} vazdushniy agregat${fn ? ` · ${fn}` : ""}`;
  }
  return { ok: true, title, base: Math.round(base * 100) / 100, standard: product.base, negotiated: false, frameChanged, product, changes, lines, telegram, options: { liters, hp, fn, condenserId, condenser, composition: null } };
}
