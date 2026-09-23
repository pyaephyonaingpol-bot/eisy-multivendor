import type { NextConfig } from "next";

/**
 * Prefer NEXT_PUBLIC_* (browser-safe). Fall back to unprefixed Vercel aliases
 * so builds still embed public Supabase credentials when only SUPABASE_URL /
 * SUPABASE_ANON_KEY / SUPABASE_PUBLISHABLE_KEY are set in the project.
 * Never map service_role / secret keys into the client bundle.
 */
function publicSupabaseUrl(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    undefined
  );
}

function publicSupabaseAnonKey(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.SUPABASE_PUBLISHABLE_KEY?.trim() ||
    undefined
  );
}

const resolvedUrl = publicSupabaseUrl();
const resolvedAnonKey = publicSupabaseAnonKey();

const nextConfig: NextConfig = {
  // Allow local/network/tunnel origins to hit the Next.js dev server (HMR, assets).
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    "172.30.0.2",
    "landslide-handmade-confetti.ngrok-free.dev",
  ],
  env: {
    ...(resolvedUrl ? { NEXT_PUBLIC_SUPABASE_URL: resolvedUrl } : {}),
    ...(resolvedAnonKey
      ? { NEXT_PUBLIC_SUPABASE_ANON_KEY: resolvedAnonKey }
      : {}),
  },
  experimental: {
    serverActions: {
      // Allow multipart product image uploads (up to 5 × 2MB + overhead).
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
