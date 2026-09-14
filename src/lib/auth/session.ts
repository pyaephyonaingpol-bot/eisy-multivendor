import { createClient } from "@/lib/supabase/server";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import type { Profile, UserRole } from "@/lib/types/database";

export type SessionProfile = {
  userId: string;
  email: string | undefined;
  profile: Profile | null;
  role: UserRole | null;
};

export async function getSessionProfile(): Promise<SessionProfile | null> {
  if (!getSupabasePublicEnv()) {
    return null;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  const profile = data as Profile | null;

  return {
    userId: user.id,
    email: user.email,
    profile,
    role: profile?.role ?? null,
  };
}

export function canAccessVendor(role: UserRole | null | undefined) {
  return role === "vendor" || role === "admin";
}

export function canAccessAdmin(role: UserRole | null | undefined) {
  return role === "admin";
}
