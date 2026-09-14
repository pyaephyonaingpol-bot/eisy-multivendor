import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/types/database";
import { getSupabaseConfigError, getSupabasePublicEnv } from "@/lib/supabase/env";

export function createClient() {
  const env = getSupabasePublicEnv();

  if (!env) {
    throw new Error(getSupabaseConfigError());
  }

  return createBrowserClient<Database>(env.url, env.anonKey);
}
