import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow local/network origins to hit the Next.js dev server (HMR, assets).
  allowedDevOrigins: ["127.0.0.1", "localhost", "172.30.0.2"],
  experimental: {
    serverActions: {
      // Allow multipart product image uploads (up to 5 × 2MB + overhead).
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
