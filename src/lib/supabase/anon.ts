import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { getSupabaseConfigError, getSupabasePublicEnv } from "@/lib/supabase/env";

/**
 * Cookieless anon client for cacheable public reads (catalog, etc.).
 * Safe inside unstable_cache — does not touch next/headers cookies().
 */
export function createAnonClient() {
  const env = getSupabasePublicEnv();
  if (!env) {
    throw new Error(getSupabaseConfigError());
  }

  return createClient<Database>(env.url, env.anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
