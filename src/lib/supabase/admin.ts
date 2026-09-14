import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { getSupabaseConfigError, getSupabasePublicEnv } from "@/lib/supabase/env";

/**
 * Service-role client for trusted server-only operations (e.g. Storage uploads
 * after the calling action has already verified vendor ownership).
 * Never import this into client components.
 */
export function createServiceClient() {
  const env = getSupabasePublicEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!env || !serviceRoleKey) {
    throw new Error(
      getSupabaseConfigError() +
        " Also set SUPABASE_SERVICE_ROLE_KEY for server-side Storage uploads.",
    );
  }

  return createClient<Database>(env.url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
