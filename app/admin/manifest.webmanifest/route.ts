import { adminManifest } from "@/lib/pwa";

export const dynamic = "force-static";

export function GET() {
  return new Response(JSON.stringify(adminManifest()), { headers: { "content-type": "application/manifest+json; charset=utf-8" } });
}
