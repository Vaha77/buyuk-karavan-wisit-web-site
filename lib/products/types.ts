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
export type ProductSpecification = { id: string; name: string; value: string; mobileOrder?: number };
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
  specifications?: ProductSpecification[];
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
