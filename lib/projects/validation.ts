import { z } from "zod";
export const projectSchema = z.object({
  title: z.string().trim().min(1, "Loyiha nomini kiriting.").max(160),
  slug: z.string().trim().min(1, "Slug kiriting.").max(180).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug noto'g'ri."),
  shortDescription: z.string().trim().max(500), description: z.string().trim().max(10000),
  location: z.string().trim().max(200), temperature: z.string().trim().max(120), capacity: z.string().trim().max(120), category: z.string().trim().max(120),
  isVisible: z.boolean(), isFeatured: z.boolean(), order: z.number().int().min(0).max(100000),
});
export type ProjectInput = z.infer<typeof projectSchema>;
