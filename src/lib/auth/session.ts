import { createClient } from "@/lib/supabase/server";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import {
  canAccessAdmin,
  canAccessVendor,
  normalizeUserRole,
  resolveUserRole,
} from "@/lib/auth/roles";
import type { Profile, UserRole } from "@/lib/types/database";

export type SessionProfile = {
  userId: string;
  email: string | undefined;
  profile: Profile | null;
  role: UserRole | null;
};

export { canAccessAdmin, canAccessVendor, normalizeUserRole, resolveUserRole };

/**
 * Never throws — auth layout/header must not 500 the login/register pages
 * when Supabase is misconfigured or unreachable.
 */
export async function getSessionProfile(): Promise<SessionProfile | null> {
  if (!getSupabasePublicEnv()) {
    return null;
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return null;
    }

    try {
      await supabase.rpc("ensure_own_profile");
    } catch {
      // RPC may be missing until migration 031 is applied.
    }

    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    let profile = (data as Profile | null) ?? null;

    if (!profile && user.email) {
      const { data: byEmail } = await supabase
        .from("profiles")
        .select("*")
        .ilike("email", user.email.trim())
        .maybeSingle();
      profile = (byEmail as Profile | null) ?? null;
    }

    const role =
      (await resolveUserRole({
        supabase,
        userId: user.id,
        email: user.email,
      })) ?? normalizeUserRole(profile?.role);

    return {
      userId: user.id,
      email: user.email,
      profile,
      role,
    };
  } catch {
    return null;
  }
}
