import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Allow multipart product image uploads (up to 5 × 2MB + overhead).
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
