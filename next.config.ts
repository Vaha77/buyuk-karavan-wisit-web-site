import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.0.33"],
  // authInterrupts: forbidden() renders app/forbidden.tsx with a 403 (SELLER outside /admin/my).
  experimental: { serverActions: { bodySizeLimit: "125mb" }, authInterrupts: true },
  images: { remotePatterns: [{ protocol: "https", hostname: "br-jolly-truth-b1os0auf.storage.c-5.eu-central-1.aws.neon.tech", pathname: "/product-images/**", search: "" }] },
  outputFileTracingIncludes: { "/admin/calculations/*/pdf": ["./node_modules/@fontsource/noto-sans/files/noto-sans-latin-ext-400-normal.woff"] },
};

export default nextConfig;
