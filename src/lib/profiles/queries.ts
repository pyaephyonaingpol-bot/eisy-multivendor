import { createClient } from "@/lib/supabase/server";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import type { Profile } from "@/lib/types/database";

export type ProfileQueryResult =
  | { ok: true; profile: Profile; authEmail: string | undefined }
  | { ok: false; error: string };

/**
 * Load the signed-in user's `profiles` row for the profile page.
 * Surfaces query errors instead of silently returning an empty UI.
 */
export async function getCurrentUserProfile(): Promise<ProfileQueryResult> {
  if (!getSupabasePublicEnv()) {
    return {
      ok: false,
      error:
        "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      return { ok: false, error: userError.message };
    }
    if (!user) {
      return { ok: false, error: "Not signed in." };
    }

    const { data, error } = await supabase
      .from("profiles")
      .select(
        "id, email, full_name, avatar_url, phone, role, preferred_region_id, preferred_country_code, created_at, updated_at",
      )
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      return { ok: false, error: error.message };
    }

    if (!data) {
      return {
        ok: false,
        error:
          "No profile row found for this account. Sign out and register again, or contact support.",
      };
    }

    return {
      ok: true,
      profile: data as Profile,
      authEmail: user.email,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Failed to load profile.",
    };
  }
}
