const NEON_STORAGE_HOST_SUFFIX = ".neon.tech";

export function isPublicNeonImage(src: string): boolean {
  try {
    const url = new URL(src);
    return url.protocol === "https:" &&
      url.hostname.includes(".storage.") &&
      url.hostname.endsWith(NEON_STORAGE_HOST_SUFFIX) &&
      /^\/product-images\/(products|projects)\//.test(url.pathname);
  } catch {
    return false;
  }
}

export const isPublicNeonProductImage = isPublicNeonImage;
