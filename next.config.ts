import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.0.33"],
  experimental: { serverActions: { bodySizeLimit: "125mb" } },
  images: { remotePatterns: [{ protocol: "https", hostname: "br-jolly-truth-b1os0auf.storage.c-5.eu-central-1.aws.neon.tech", pathname: "/product-images/products/**", search: "" }] },
};

export default nextConfig;
