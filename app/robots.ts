import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      // /privacy and /data-deletion must stay reachable (Meta checks them for the Instagram app).
      allow: ["/", "/privacy", "/data-deletion"],
      disallow: ["/admin", "/admin/", "/api/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
