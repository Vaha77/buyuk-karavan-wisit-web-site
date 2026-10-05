// Komplekt konfiguratori: a standard air-cooled kit split into compressor / condenser block / evaporator part, priced
// only from Prays differences (pure, for the tests and the browser):
//   condenser block = standard agregat with that condenser − its compressor;   evaporator part = kit − agregat.
// The template's own model is the source of its standard parts, so the standard combination costs exactly the kit price.
import { formatUsd, normalizeBrand, productFeatures, sellPrice } from "../prays/rules";
import { modeValue, type ZborkaProduct } from "./zborka";

export type KitSlot = "comp" | "cond" | "evap";
export type KitOption = { key: string; name: string; spec: string; price: number; source: string; sourceNoPrice: string };
export type KitTemplate = { id: string; title: string; group: string; base: number; model: string; fn: string; evaporator: string; options: Record<KitSlot, KitOption[]> };

type Item = { product: ZborkaProduct; base: number; model: string; fn: string | null; evaporator: string | null };
const label = (brand: string, model: string) => `${brand} ${model}`.trim();
const byNumber = (a: string, b: string) => Number(a.replace(/\D+/g, "")) - Number(b.replace(/\D+/g, "")) || a.localeCompare(b);
const evaporatorSpec = (code: string) => (/^DJ/i.test(code) ? "Nerj" : /^DD/i.test(code) ? "Alumin" : "");

export function buildKitTemplates(products: ZborkaProduct[]): KitTemplate[] {
  type Group = { brand: string; compressors: Map<string, Item>; agregats: Item[]; kits: Item[] };
  const groups = new Map<string, Group>();
  for (const product of products) {
    if (product.basePriceUsd === null) continue;
    const f = productFeatures(product);
    if (!["compressor", "air", "air-kit"].includes(f.kind) || !f.modelKey) continue;
    const brand = normalizeBrand(product.brand), key = `${brand}|${f.freon ?? ""}`;
    const group: Group = groups.get(key) ?? { brand, compressors: new Map(), agregats: [], kits: [] };
    groups.set(key, group);
    const item: Item = { product, base: product.basePriceUsd, model: f.modelKey, fn: f.fn, evaporator: f.evaporator };
    if (f.kind === "compressor") { const current = group.compressors.get(f.modelKey); if (!current || current.base > item.base) group.compressors.set(f.modelKey, item); }
    else if (f.kind === "air" && f.fn) group.agregats.push(item);
    else if (f.kind === "air-kit" && f.fn && f.evaporator) group.kits.push(item);
  }
  const templates: KitTemplate[] = [];
  for (const [groupKey, group] of groups) {
    const display = (model: string) => label(group.brand, group.compressors.get(model)?.product.model ?? model);
    const agregatOf = (model: string, fn: string) => group.agregats.filter(item => item.model === model && item.fn === fn).sort((a, b) => a.base - b.base)[0];
    // Condenser blocks: agregat − compressor of the same model, per FN code.
    const condenser = new Map<string, Array<{ value: number; model: string; agregat: number; compressor: number }>>();
    for (const agregat of group.agregats) {
      const compressor = group.compressors.get(agregat.model);
      if (!compressor) continue;
      condenser.set(agregat.fn!, [...(condenser.get(agregat.fn!) ?? []), { value: agregat.base - compressor.base, model: agregat.model, agregat: agregat.base, compressor: compressor.base }]);
    }
    // Evaporator parts: kit − agregat of the same model and condenser, per evaporator code.
    const evaporator = new Map<string, Array<{ value: number; model: string; kit: number; agregat: number; fn: string }>>();
    for (const kit of group.kits) {
      const agregat = agregatOf(kit.model, kit.fn!);
      if (agregat) evaporator.set(kit.evaporator!, [...(evaporator.get(kit.evaporator!) ?? []), { value: kit.base - agregat.base, model: kit.model, kit: kit.base, agregat: agregat.base, fn: kit.fn! }]);
    }
    const pick = <T extends { value: number; model: string }>(list: T[], preferModel: string) => list.find(item => item.model === preferModel) ?? list.find(item => item.value === modeValue(list.map(entry => entry.value)))!;
    for (const kit of group.kits) {
      const compressor = group.compressors.get(kit.model), agregat = agregatOf(kit.model, kit.fn!);
      if (!compressor || !agregat) continue;
      const comp: KitOption[] = [...group.compressors.values()].sort((a, b) => a.base - b.base).map(item => ({ key: item.model, name: display(item.model), spec: item.product.name.replace(/^.*?kompressor\s*/i, "").trim() || "Kompressor", price: item.base, source: `Prays: ${display(item.model)} kompressor = ${formatUsd(item.base)}`, sourceNoPrice: `Prays: ${display(item.model)} kompressor` }));
      const cond: KitOption[] = [...condenser.entries()].sort((a, b) => byNumber(a[0], b[0])).map(([fn, list]) => { const used = pick(list, kit.model); return { key: fn, name: fn, spec: "resiver + rama bilan", price: used.value, source: `${display(used.model)} agregat ${fn} ${formatUsd(used.agregat)} − ${display(used.model)} kompressor ${formatUsd(used.compressor)} = ${formatUsd(used.value)}`, sourceNoPrice: `${display(used.model)} agregat ${fn} − ${display(used.model)} kompressor` }; });
      const evap: KitOption[] = [...evaporator.entries()].sort((a, b) => byNumber(a[0], b[0])).map(([code, list]) => { const used = pick(list, kit.model); return { key: code, name: code, spec: evaporatorSpec(code), price: used.value, source: `${display(used.model)} komplekt ${formatUsd(used.kit)} − ${display(used.model)} agregat ${formatUsd(used.agregat)} = ${formatUsd(used.value)}`, sourceNoPrice: `${display(used.model)} komplekt − ${display(used.model)} agregat` }; });
      // The template's standard options first.
      const first = (options: KitOption[], key: string) => [...options.filter(option => option.key === key), ...options.filter(option => option.key !== key)];
      templates.push({ id: kit.product.id, title: kit.product.name, group: groupKey, base: kit.base, model: kit.model, fn: kit.fn!, evaporator: kit.evaporator!, options: { comp: first(comp, kit.model), cond: first(cond, kit.fn!), evap: first(evap, kit.evaporator!) } });
    }
  }
  return templates.sort((a, b) => a.title.localeCompare(b.title));
}

export type KitSelection = Record<KitSlot, string>;
export function standardSelection(template: KitTemplate): KitSelection { return { comp: template.model, cond: template.fn, evap: template.evaporator }; }

/** Price-list total of the chosen parts plus extras (extras are entered in price-list prices too). */
export function kitTotal(template: KitTemplate, selection: KitSelection, extras: number[] = []) {
  const parts = (["comp", "cond", "evap"] as KitSlot[]).map(slot => template.options[slot].find(option => option.key === selection[slot]));
  if (parts.some(part => !part)) return null;
  const sum = parts.reduce((total, part) => total + part!.price, 0) + extras.reduce((total, value) => total + (Number.isFinite(value) && value > 0 ? value : 0), 0);
  return { parts: parts as KitOption[], base: Math.round(sum * 100) / 100 };
}
export const KIT_MARKUP_MAX = 15;
/** Client price: ceil(total × (100 + markup) / 100), markup 0–15 %. */
export function kitClientPrice(base: number, markup: number) { return sellPrice(base, Math.min(Math.max(Math.round(markup), 0), KIT_MARKUP_MAX)); }
