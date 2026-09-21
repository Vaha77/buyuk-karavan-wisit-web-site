import { z } from "zod";

export const productInputSchema = z.object({
  name: z.string().trim().min(1, "Mahsulot nomini kiriting.").max(120, "Mahsulot nomi juda uzun."),
  brand: z.string().trim().min(1, "Brendni kiriting.").max(120, "Brend juda uzun."),
  model: z.string().trim().min(1, "Modelni kiriting.").max(120, "Model juda uzun."),
  slug: z.string().trim().max(160, "Slug juda uzun."),
  categoryId: z.string().trim().min(1, "Kategoriyani tanlang.").max(100),
  shortDescription: z.string().trim().max(500, "Qisqa tavsif juda uzun."),
  description: z.string().trim().max(10000, "Tavsif juda uzun."),
  specifications: z.array(z.object({ id: z.string().min(1).max(100), name: z.string().trim().min(1, "Xususiyat nomini kiriting.").max(120), value: z.string().trim().min(1, "Xususiyat qiymatini kiriting.").max(500), mobileOrder: z.number().int().optional() })).max(60, "Xususiyatlar soni juda ko‘p."),
  tags: z.array(z.string().trim().min(1).max(80)).max(30, "Teglar soni juda ko‘p."),
  availability: z.enum(["available", "order"], { error: "Holatni tanlang." }),
  isVisible: z.boolean(),
  order: z.number().int().min(1, "Tartib musbat son bo‘lishi kerak.").max(1000000),
  seoTitle: z.string().trim().max(160, "SEO title juda uzun."),
  seoDescription: z.string().trim().max(500, "SEO description juda uzun."),
});

export type ProductInput = z.infer<typeof productInputSchema>;

export function normalizeSlug(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function validateProductInput(value: unknown) {
  const parsed = productInputSchema.safeParse(value);
  if (!parsed.success) return { success: false as const, error: parsed.error.issues[0]?.message ?? "Ma’lumotlarni tekshiring." };
  const slug = normalizeSlug(parsed.data.slug || `${parsed.data.name} ${parsed.data.model}`);
  if (!slug || slug.length > 160) return { success: false as const, error: "To‘g‘ri URL slug kiriting." };
  return { success: true as const, data: { ...parsed.data, slug } };
}
