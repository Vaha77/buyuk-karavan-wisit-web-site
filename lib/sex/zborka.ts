// Zborka buyurtmasi pricing, built only from Prays data (never hard-coded tables). Pure, for the tests and the browser.
//   water condenser (HP) = vadinoy agregat − R/B ustida      FN block = vazdushniy agregat − R/B ustida
//   receiver (L)         = SexPart "Resiver bachok {L}"      price = standard + Σ(chosen part − standard part)
import { litersOf, normalizeBrand, productFeatures } from "../prays/rules";

export type ZborkaProduct = { id: string; name: string; brand: string; model: string; categoryName: string | null; basePriceUsd: number | null };
export type ZborkaPart = { id: string; name: string; size: string | null; group: string; basePriceUsd: number | null };
export type Assembly = "k" | "rb" | "vd" | "vz";
export const ASSEMBLIES: Array<{ key: Assembly; name: string; sub: string }> = [
  { key: "k", name: "Kompressor o‘zi", sub: "faqat kompressor" },
  { key: "rb", name: "Resiver bachok ustida", sub: "kompressor + resiver" },
  { key: "vd", name: "Vadinoy agregat", sub: "+ suvli kondensator" },
  { key: "vz", name: "Vazdushniy agregat", sub: "+ FN kondensator, rama" },
];
type Priced = { id: string; name: string; base: number };
export type ZborkaModel = { key: string; model: string; k: Priced | null; rb: Priced | null; vd: Priced | null; vz: Priced | null; liters: string | null; hp: string | null; fn: string | null };
export type ZborkaGroup = { key: string; label: string; brand: string; models: ZborkaModel[]; hpTable: Record<string, number>; fnTable: Record<string, number> };
export type ZborkaCatalog = { groups: ZborkaGroup[]; receivers: Record<string, number> };

/** Most frequent difference; a tie goes to the smaller value (FN120: 1016 vs 1017 → 1016). */
export function modeValue(values: number[]) {
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? null;
}
const byNumber = (a: string, b: string) => Number(a.replace(/\D+/g, "")) - Number(b.replace(/\D+/g, "")) || a.localeCompare(b);
const titleCase = (brand: string) => brand.length > 3 && brand === brand.toUpperCase() && brand !== "XUEYING" ? brand.charAt(0) + brand.slice(1).toLowerCase() : brand;

/** Price lists ("Bitzer R22", "XUEYING", "Briliant R404"…) with each compressor's standard assemblies and the part tables. */
export function buildZborkaCatalog(products: ZborkaProduct[], parts: ZborkaPart[]): ZborkaCatalog {
  const groups = new Map<string, { brand: string; label: string; models: Map<string, ZborkaModel> }>();
  for (const product of products) {
    if (product.basePriceUsd === null) continue;
    const f = productFeatures(product);
    const slot = f.kind === "compressor" ? "k" : f.kind === "receiver" ? "rb" : f.kind === "water" ? "vd" : f.kind === "air" ? "vz" : null;
    if (!slot || !f.modelKey) continue;
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
    return { key, label: group.label, brand: group.brand, models, hpTable: diffs(model => [model.hp, model.vd]), fnTable: diffs(model => [model.fn, model.vz]) };
  }).filter(group => group.models.length).sort((a, b) => a.label.localeCompare(b.label));
  const receivers: Record<string, number> = {};
  for (const part of parts) {
    if (part.basePriceUsd === null || !/resiver|receiver/i.test(`${part.group} ${part.name}`)) continue;
    const liters = litersOf(`${part.size ?? ""} ${part.name}`) ?? part.size?.match(/^\s*(\d+(?:[.,]\d+)?)\s*$/)?.[1]?.replace(",", ".");
    if (liters && receivers[liters] === undefined) receivers[liters] = part.basePriceUsd;
  }
  return { groups: result, receivers: Object.fromEntries(Object.entries(receivers).sort((a, b) => byNumber(a[0], b[0]))) };
}

export type ZborkaChoice = { assembly: Assembly; liters?: string | null; hp?: string | null; fn?: string | null };
export type ZborkaChange = { part: "receiver" | "water" | "air"; label: string; chosen: string; standard: string; delta: number };
export type ZborkaQuote = { ok: true; title: string; base: number; standard: number; product: Priced; changes: ZborkaChange[]; lines: Array<{ k: string; v: string }>; telegram: string[]; options: { liters: string; hp: string; fn: string } } | { ok: false; error: string };

/** Price and description of one configured assembly. A part can only be swapped when both its prices are known. */
export function quoteZborka(model: ZborkaModel, group: Pick<ZborkaGroup, "label" | "hpTable" | "fnTable" | "brand">, receivers: Record<string, number>, choice: ZborkaChoice): ZborkaQuote {
  const product = model[choice.assembly];
  if (!product) return { ok: false, error: "Bu yig‘ma turi uchun praysda narx yo‘q." };
  const brand = group.brand, changes: ZborkaChange[] = [], lines = [{ k: "Kompressor", v: `${brand} ${model.model}` }], telegram: string[] = [];
  let base = product.base;
  const liters = choice.assembly === "k" ? "" : choice.liters || model.liters || "", hp = choice.hp || model.hp || "", fn = choice.fn || model.fn || "";
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
    if (fn !== (model.fn ?? "")) {
      const chosen = group.fnTable[fn], standard = model.fn ? group.fnTable[model.fn] : undefined;
      if (chosen === undefined || standard === undefined) return { ok: false, error: "FN kondensator narxi topilmadi" };
      changes.push({ part: "air", label: "Kondensator", chosen: fn, standard: model.fn!, delta: chosen - standard }); base += chosen - standard;
    }
    lines.push({ k: "Kondensator", v: fn ? `${fn} + rama` : "standart" });
    telegram.push(`Kondensator: ${fn || "standart"}${fn !== (model.fn ?? "") ? ` (standart ${model.fn} o‘rniga)` : ""}, rama bilan`);
    title = `${brand} ${model.model} vazdushniy agregat${fn ? ` · ${fn}` : ""}`;
  }
  return { ok: true, title, base: Math.round(base * 100) / 100, standard: product.base, product, changes, lines, telegram, options: { liters, hp, fn } };
}
