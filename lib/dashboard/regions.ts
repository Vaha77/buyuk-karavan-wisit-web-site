/**
 * Countries and admin-1 regions shown on the BKLead dashboard maps and in the public lead form.
 * Region codes are ISO-3166-2 based (Natural Earth admin-1). Where Natural Earth reuses one ISO code
 * for two areas, the second area gets its own code (KZ-ALM, AF-PAN, AF-DAY); see scripts/build-region-maps.mjs.
 * Lead.regionCode stores these codes; Lead.region keeps whatever free text the visitor typed.
 */
export const COUNTRY_CODES = ["UZ", "KZ", "KG", "TJ", "TM", "AF"] as const;
export type CountryCode = (typeof COUNTRY_CODES)[number];
export type LeadCountry = CountryCode | "OTHER";

export const COUNTRY_NAMES: Record<LeadCountry, string> = { UZ: "O‘zbekiston", KZ: "Qozog‘iston", KG: "Qirg‘iziston", TJ: "Tojikiston", TM: "Turkmaniston", AF: "Afg‘oniston", OTHER: "Boshqa davlat" };

export type RegionInfo = { code: string; country: CountryCode; name: string; city?: boolean };

// Order = order in the public form select.
export const REGIONS: RegionInfo[] = [
  { code: "UZ-TK", country: "UZ", name: "Toshkent shahri", city: true },
  { code: "UZ-TO", country: "UZ", name: "Toshkent viloyati" },
  { code: "UZ-AN", country: "UZ", name: "Andijon viloyati" },
  { code: "UZ-BU", country: "UZ", name: "Buxoro viloyati" },
  { code: "UZ-FA", country: "UZ", name: "Farg‘ona viloyati" },
  { code: "UZ-JI", country: "UZ", name: "Jizzax viloyati" },
  { code: "UZ-XO", country: "UZ", name: "Xorazm viloyati" },
  { code: "UZ-NG", country: "UZ", name: "Namangan viloyati" },
  { code: "UZ-NW", country: "UZ", name: "Navoiy viloyati" },
  { code: "UZ-QA", country: "UZ", name: "Qashqadaryo viloyati" },
  { code: "UZ-QR", country: "UZ", name: "Qoraqalpog‘iston Respublikasi" },
  { code: "UZ-SA", country: "UZ", name: "Samarqand viloyati" },
  { code: "UZ-SI", country: "UZ", name: "Sirdaryo viloyati" },
  { code: "UZ-SU", country: "UZ", name: "Surxondaryo viloyati" },

  { code: "KZ-AST", country: "KZ", name: "Astana shahri", city: true },
  { code: "KZ-ALM", country: "KZ", name: "Almati shahri", city: true },
  { code: "KZ-SHY", country: "KZ", name: "Chimkent shahri", city: true },
  { code: "KZ-YUZ", country: "KZ", name: "Turkiston viloyati" },
  { code: "KZ-ZHA", country: "KZ", name: "Jambil viloyati" },
  { code: "KZ-ALA", country: "KZ", name: "Almati viloyati" },
  { code: "KZ-KZY", country: "KZ", name: "Qizilo‘rda viloyati" },
  { code: "KZ-MAN", country: "KZ", name: "Mang‘istov viloyati" },
  { code: "KZ-AKT", country: "KZ", name: "Aqto‘ba viloyati" },
  { code: "KZ-ATY", country: "KZ", name: "Atirau viloyati" },
  { code: "KZ-ZAP", country: "KZ", name: "G‘arbiy Qozog‘iston viloyati" },
  { code: "KZ-KUS", country: "KZ", name: "Qo‘stanay viloyati" },
  { code: "KZ-SEV", country: "KZ", name: "Shimoliy Qozog‘iston viloyati" },
  { code: "KZ-AKM", country: "KZ", name: "Aqmola viloyati" },
  { code: "KZ-PAV", country: "KZ", name: "Pavlodar viloyati" },
  { code: "KZ-KAR", country: "KZ", name: "Qarag‘andi viloyati" },
  { code: "KZ-VOS", country: "KZ", name: "Sharqiy Qozog‘iston viloyati" },

  { code: "KG-GB", country: "KG", name: "Bishkek shahri", city: true },
  { code: "KG-O", country: "KG", name: "O‘sh viloyati" },
  { code: "KG-J", country: "KG", name: "Jalolobod viloyati" },
  { code: "KG-B", country: "KG", name: "Botken viloyati" },
  { code: "KG-C", country: "KG", name: "Chuy viloyati" },
  { code: "KG-T", country: "KG", name: "Talas viloyati" },
  { code: "KG-N", country: "KG", name: "Norin viloyati" },
  { code: "KG-Y", country: "KG", name: "Issiqko‘l viloyati" },

  { code: "TJ-DU", country: "TJ", name: "Dushanbe shahri", city: true },
  { code: "TJ-SU", country: "TJ", name: "So‘g‘d viloyati" },
  { code: "TJ-KT", country: "TJ", name: "Xatlon viloyati" },
  { code: "TJ-GB", country: "TJ", name: "Tog‘li Badaxshon" },
  { code: "TJ-RR", country: "TJ", name: "Respublika tasarrufidagi tumanlar" },

  { code: "TM-A", country: "TM", name: "Ahal viloyati" },
  { code: "TM-B", country: "TM", name: "Balkan viloyati" },
  { code: "TM-D", country: "TM", name: "Dashoguz viloyati" },
  { code: "TM-L", country: "TM", name: "Lebap viloyati" },
  { code: "TM-M", country: "TM", name: "Mari viloyati" },

  { code: "AF-KAB", country: "AF", name: "Kobul" }, { code: "AF-BAL", country: "AF", name: "Balx" }, { code: "AF-HER", country: "AF", name: "Hirot" },
  { code: "AF-KDZ", country: "AF", name: "Qunduz" }, { code: "AF-JOW", country: "AF", name: "Jovzjon" }, { code: "AF-FYB", country: "AF", name: "Foryob" },
  { code: "AF-TAK", country: "AF", name: "Taxor" }, { code: "AF-BDS", country: "AF", name: "Badaxshon" }, { code: "AF-SAM", country: "AF", name: "Samangon" },
  { code: "AF-SAR", country: "AF", name: "Sari Pul" }, { code: "AF-BGL", country: "AF", name: "Bag‘lon" }, { code: "AF-BDG", country: "AF", name: "Bodg‘is" },
  { code: "AF-NIM", country: "AF", name: "Nimro‘z" }, { code: "AF-FRA", country: "AF", name: "Farah" }, { code: "AF-KNR", country: "AF", name: "Kunar" },
  { code: "AF-NUR", country: "AF", name: "Nuriston" }, { code: "AF-NAN", country: "AF", name: "Nangarhor" }, { code: "AF-KHO", country: "AF", name: "Xost" },
  { code: "AF-PKA", country: "AF", name: "Paktiya" }, { code: "AF-PIA", country: "AF", name: "Paktika" }, { code: "AF-ZAB", country: "AF", name: "Zobul" },
  { code: "AF-KAN", country: "AF", name: "Qandahor" }, { code: "AF-HEL", country: "AF", name: "Hilmand" }, { code: "AF-URU", country: "AF", name: "Uruzgon" },
  { code: "AF-DAY", country: "AF", name: "Dayqundi" }, { code: "AF-GHA", country: "AF", name: "G‘azni" }, { code: "AF-PAR", country: "AF", name: "Parvon" },
  { code: "AF-PAN", country: "AF", name: "Panjshir" }, { code: "AF-LAG", country: "AF", name: "Lag‘mon" }, { code: "AF-LOG", country: "AF", name: "Lo‘gar" },
  { code: "AF-KAP", country: "AF", name: "Kapiso" }, { code: "AF-WAR", country: "AF", name: "Vardak" }, { code: "AF-BAM", country: "AF", name: "Bomiyon" },
  { code: "AF-GHO", country: "AF", name: "G‘or" },
];

export const REGION_BY_CODE = new Map(REGIONS.map(region => [region.code, region]));
export function regionName(code: string | null | undefined) { return (code && REGION_BY_CODE.get(code)?.name) || "Aniqlanmagan"; }
export function regionsOf(country: CountryCode) { return REGIONS.filter(region => region.country === country); }
export function isCountryCode(value: unknown): value is CountryCode { return typeof value === "string" && (COUNTRY_CODES as readonly string[]).includes(value); }
export function isRegionOf(code: string, country: string) { return REGION_BY_CODE.get(code)?.country === country; }

/** The Fergana valley callout on the Uzbekistan map. */
export const FERGANA_VALLEY = ["UZ-NG", "UZ-AN", "UZ-FA"] as const;

// Best-effort matching of free text ("qoqon", "Namangan viloyati") to a region code.
// Mirrors the SQL backfill in prisma/migrations/20260930090000_add_bklead_dashboard.
const TEXT_PATTERNS: Array<[RegExp, string]> = [
  [/(toshkent|tashkent)\s*(sh\.?|shahri|shahar|city)/, "UZ-TK"], [/(toshkent|tashkent)/, "UZ-TO"],
  [/(qo.?qon|kokand|farg|ferg|marg.?ilon)/, "UZ-FA"], [/naman/, "UZ-NG"], [/andij/, "UZ-AN"], [/(buxor|bukhar)/, "UZ-BU"],
  [/(jizz|jizax|jizak)/, "UZ-JI"], [/(xorazm|khorezm|horazm|urganch)/, "UZ-XO"], [/navo/, "UZ-NW"], [/(qashqa|kashka|qarshi)/, "UZ-QA"],
  [/(qoraqalp|karakalp|nukus)/, "UZ-QR"], [/samar/, "UZ-SA"], [/(sirdar|syrdar|guliston)/, "UZ-SI"], [/(surxon|surkhan|termiz)/, "UZ-SU"],
];
export function matchRegionText(text: string | null | undefined): string | null {
  const value = (text || "").toLowerCase();
  return value ? TEXT_PATTERNS.find(([pattern]) => pattern.test(value))?.[1] ?? null : null;
}
