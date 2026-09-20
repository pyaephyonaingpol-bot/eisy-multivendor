import { createClient } from "@/lib/supabase/server";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import type { Profile, UserRole } from "@/lib/types/database";

export type SessionProfile = {
  userId: string;
  email: string | undefined;
  profile: Profile | null;
  role: UserRole | null;
};

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

    // Heal missing profiles rows so headers / role gates see real data.
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

    const profile = (data as Profile | null) ?? null;

    return {
      userId: user.id,
      email: user.email,
      profile,
      role: profile?.role ?? null,
    };
  } catch {
    return null;
  }
}

export function canAccessVendor(role: UserRole | null | undefined) {
  return role === "vendor" || role === "admin";
}

export function canAccessAdmin(role: UserRole | null | undefined) {
  return role === "admin";
}
