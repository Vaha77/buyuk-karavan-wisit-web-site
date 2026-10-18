import { assetLinks } from "@/lib/pwa";

/** Served as /.well-known/assetlinks.json (rewrite in next.config.ts). */
export function GET() {
  return Response.json(assetLinks(process.env.ANDROID_SHA256_FINGERPRINTS));
}
