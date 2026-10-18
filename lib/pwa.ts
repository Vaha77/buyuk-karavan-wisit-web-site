// Admin panel as an installable app (PWA) and the Android app link. Pure, tested.
export const ANDROID_PACKAGE = "uz.buyukkaravan.admin";
/** Served without a session (the browser fetches them without cookies); everything else under /admin needs a login. */
export const PUBLIC_ADMIN_PATHS = ["/admin/login", "/admin/register", "/admin/manifest.webmanifest", "/admin/sw.js"];
const NAVY = "#102c47";

export function adminManifest() {
  return {
    name: "Buyuk Karavan Admin", short_name: "BK Admin", start_url: "/admin", scope: "/admin", display: "standalone",
    background_color: "#f7fbff", theme_color: NAVY, lang: "uz",
    icons: [
      { src: "/admin-icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/admin-icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/admin-icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

/** /.well-known/assetlinks.json for the Android app; fingerprints from ANDROID_SHA256_FINGERPRINTS (comma separated). */
export function assetLinks(fingerprints: string | undefined) {
  const list = (fingerprints ?? "").split(",").map(item => item.trim().toUpperCase()).filter(item => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(item));
  return list.length ? [{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: ANDROID_PACKAGE, sha256_cert_fingerprints: list } }] : [];
}
