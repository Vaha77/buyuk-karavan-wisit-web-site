import type { MetadataRoute } from "next";
import { getDb } from "@/lib/db";
import { SITE_URL } from "@/lib/site-url";

export const revalidate = 300;

function sitemapError(source: "products" | "projects", error: unknown) {
  console.error("[Sitemap]", {
    source,
    errorName: error instanceof Error ? error.name : "UnknownError",
    errorMessage: "Unable to load public sitemap URLs",
  });
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/products`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/projects`, changeFrequency: "weekly", priority: 0.8 },
  ];

  const [productsResult, projectsResult] = await Promise.allSettled([
    getDb().product.findMany({
      where: { isVisible: true, category: { isActive: true } },
      select: { slug: true, updatedAt: true },
      orderBy: [{ updatedAt: "desc" }, { slug: "asc" }],
    }),
    getDb().project.findMany({
      where: { isVisible: true },
      select: { slug: true, updatedAt: true },
      orderBy: [{ updatedAt: "desc" }, { slug: "asc" }],
    }),
  ]);

  const products: MetadataRoute.Sitemap = productsResult.status === "fulfilled"
    ? productsResult.value.map(product => ({
        url: `${SITE_URL}/products/${encodeURIComponent(product.slug)}`,
        lastModified: product.updatedAt,
        changeFrequency: "weekly",
        priority: 0.8,
      }))
    : (sitemapError("products", productsResult.reason), []);

  const projects: MetadataRoute.Sitemap = projectsResult.status === "fulfilled"
    ? projectsResult.value.map(project => ({
        url: `${SITE_URL}/projects/${encodeURIComponent(project.slug)}`,
        lastModified: project.updatedAt,
        changeFrequency: "monthly",
        priority: 0.7,
      }))
    : (sitemapError("projects", projectsResult.reason), []);

  return [...staticPages, ...products, ...projects];
}
