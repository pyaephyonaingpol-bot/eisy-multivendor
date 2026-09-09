import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/types/database";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

export function createClient() {
  const env = getSupabasePublicEnv();

  if (!env) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env.local.",
    );
  }

  return createBrowserClient<Database>(env.url, env.anonKey);
}
