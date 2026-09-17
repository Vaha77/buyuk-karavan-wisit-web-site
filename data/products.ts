export const productCategories = [
  { id: "all", label: "Barchasi" },
  { id: "compressors", label: "Kompressorlar" },
  { id: "evaporators", label: "Evaporatorlar" },
  { id: "condensers", label: "Kondensatorlar" },
  { id: "chillers", label: "Chillerlar" },
  { id: "panels", label: "Sandwich panellar" },
  { id: "doors", label: "Sovutish eshiklari" },
  { id: "pipes", label: "Mis quvurlar" },
  { id: "accessories", label: "Aksessuarlar" },
] as const;

export type ProductCategory = Exclude<(typeof productCategories)[number]["id"], "all">;
export type ProductAvailability = "available" | "order";
export type Product = {
  id: string;
  slug: string;
  name: string;
  brand: string;
  model: string;
  category: ProductCategory;
  badge: string;
  image: string | null;
  images?: string[];
  shortDescription?: string;
  description?: string;
  descriptionBullets?: string[];
  specifications?: { id: string; name: string; value: string; mobileOrder?: number }[];
  applications?: { id: string; label: string }[];
  tags?: string[];
  specs: string[];
  availability: ProductAvailability;
  order: number;
  isVisible: boolean;
  seoTitle?: string;
  seoDescription?: string;
  updatedAt?: string;
};

export const products: Product[] = [
  { id: "p01", slug: "xue-ying-br-20pg", name: "XUE YING", brand: "XUE YING", model: "BR +20PG", category: "compressors", badge: "KOMPRESSOR", image: null, specs: ["20 HP", "R404A"], tags: ["20 HP", "R404A"], availability: "available", order: 1, isVisible: true, shortDescription: "Sanoat sovutish tizimlari uchun yarim germetik porshenli kompressor.", description: "XUE YING BR +20PG — sanoat sovutish tizimlari uchun mo‘ljallangan yarim germetik porshenli kompressor. Sovutish kameralari, mahsulot omborlari va boshqa sanoat sovutish qurilmalarida ishlatiladi.", descriptionBullets: ["R404A sovutgich bilan ishlashga mo‘ljallangan", "Sanoat sovutish agregatlari tarkibida qo‘llaniladi", "O‘rnatish va sozlash bo‘yicha maslahat mavjud"], specifications: [{id:"power",name:"Quvvat",value:"20 HP",mobileOrder:2},{id:"refrigerant",name:"Sovutgich",value:"R404A",mobileOrder:3},{id:"oil",name:"Moy turi",value:"—",mobileOrder:8},{id:"dimensions",name:"O‘lchamlari",value:"—",mobileOrder:10},{id:"temperature",name:"Ishlash harorati",value:"—",mobileOrder:5},{id:"voltage",name:"Kuchlanish",value:"—",mobileOrder:6},{id:"cylinders",name:"Silindrlar",value:"—",mobileOrder:7},{id:"weight",name:"Og‘irligi",value:"—",mobileOrder:9}], applications: [{id:"rooms",label:"Sovutish kameralari"},{id:"produce",label:"Meva va sabzavot saqlash"},{id:"meat",label:"Go‘sht mahsulotlari"},{id:"industrial",label:"Sanoat sovutish tizimlari"}] },
  { id: "p02", slug: "bitzer-4tes-9y", name: "Bitzer", brand: "Bitzer", model: "4TES-9Y", category: "compressors", badge: "KOMPRESSOR", image: null, specs: ["10 HP", "Yarim germetik"], availability: "available", order: 2, isVisible: true, specifications: [{id:"power",name:"Quvvat",value:"10 HP"},{id:"type",name:"Turi",value:"Yarim germetik"}] },
  { id: "p03", slug: "danfoss-mtz080-4vi", name: "Danfoss", brand: "Danfoss", model: "MTZ080-4VI", category: "compressors", badge: "KOMPRESSOR", image: null, specs: ["6 HP", "Germetik"], availability: "order", order: 3, isVisible: true, specifications: [{id:"power",name:"Quvvat",value:"6 HP"},{id:"type",name:"Turi",value:"Germetik"}] },
  { id: "p04", slug: "guntner-ghn-042", name: "Güntner", brand: "Güntner", model: "GHN 042", category: "evaporators", badge: "EVAPORATOR", image: null, specs: ["DD seriyasi", "4 ventilyator"], availability: "available", order: 4, isVisible: true },
  { id: "p05", slug: "lu-ve-shp-45", name: "LU-VE", brand: "LU-VE", model: "SHP 45", category: "evaporators", badge: "EVAPORATOR", image: null, specs: ["DJ seriyasi", "Erish tizimi"], availability: "order", order: 5, isVisible: true },
  { id: "p06", slug: "guntner-gvh-100", name: "Güntner", brand: "Güntner", model: "GVH 100", category: "condensers", badge: "KONDENSATOR", image: null, specs: ["FN seriyasi", "Havo sovutishli"], availability: "available", order: 6, isVisible: true },
  { id: "p07", slug: "alfa-laval-ace-30", name: "Alfa Laval", brand: "Alfa Laval", model: "ACE 30", category: "condensers", badge: "KONDENSATOR", image: null, specs: ["FNH seriyasi", "Kompakt"], availability: "available", order: 7, isVisible: true },
  { id: "p08", slug: "carrier-aquasnap-30ra", name: "Carrier", brand: "Carrier", model: "AquaSnap 30RA", category: "chillers", badge: "CHILLER", image: null, specs: ["15 kVt", "Suv sovutish"], availability: "order", order: 8, isVisible: true },
  { id: "p09", slug: "kingspan-pir-100mm", name: "Kingspan", brand: "Kingspan", model: "PIR 100mm", category: "panels", badge: "SANDWICH PANEL", image: null, specs: ["Devor paneli", "Yong‘inga chidamli"], availability: "available", order: 9, isVisible: true },
  { id: "p10", slug: "sanovent-se-80", name: "Sanovent", brand: "Sanovent", model: "SE-80", category: "doors", badge: "SOVUTISH ESHIGI", image: null, specs: ["80mm qalinlik", "Issiqlik izolyatsiyasi"], availability: "available", order: 10, isVisible: true },
  { id: "p11", slug: "mueller-acr-3-8", name: "Mueller", brand: "Mueller", model: "3/8\" ACR", category: "pipes", badge: "MIS QUVUR", image: null, specs: ["Bakır quvur", "Rulon"], availability: "available", order: 11, isVisible: true },
  { id: "p12", slug: "carel-ir33", name: "Carel", brand: "Carel", model: "IR33 nazorat bloki", category: "accessories", badge: "AKSESSUAR", image: null, specs: ["Raqamli termostat", "Displey"], availability: "available", order: 12, isVisible: true },
];
