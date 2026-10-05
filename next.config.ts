import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.0.33"],
  // authInterrupts: forbidden() renders app/forbidden.tsx with a 403 (SELLER outside /admin/my).
  experimental: { serverActions: { bodySizeLimit: "125mb" }, authInterrupts: true },
  images: { remotePatterns: [{ protocol: "https", hostname: "br-jolly-truth-b1os0auf.storage.c-5.eu-central-1.aws.neon.tech", pathname: "/product-images/**", search: "" }] },
  // "Sex" was renamed to "Seh": old /admin/sex links keep working (permanent → 308, query string kept).
  async redirects() {
    return [
      { source: "/admin/sex", destination: "/admin/seh", permanent: true },
      { source: "/admin/sex/:path*", destination: "/admin/seh/:path*", permanent: true },
    ];
  },
  outputFileTracingIncludes: { "/admin/calculations/*/pdf": ["./node_modules/@fontsource/noto-sans/files/noto-sans-latin-ext-400-normal.woff"] },
};

export default nextConfig;
