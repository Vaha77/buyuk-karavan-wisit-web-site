const NEON_STORAGE_HOST_SUFFIX = ".neon.tech";

export function isPublicNeonProductImage(src: string): boolean {
  try {
    const url = new URL(src);
    return url.protocol === "https:" &&
      url.hostname.includes(".storage.") &&
      url.hostname.endsWith(NEON_STORAGE_HOST_SUFFIX) &&
      url.pathname.startsWith("/product-images/products/");
  } catch {
    return false;
  }
}
