import { createClient } from "@/lib/supabase/server";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { isBootstrapAdminEmail } from "@/lib/auth/constants";
import type { Profile, UserRole } from "@/lib/types/database";

export type ProfileQueryResult =
  | { ok: true; profile: Profile; authEmail: string | undefined }
  | { ok: false; error: string };

function metaString(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | null {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function profileFromAuthUser(user: {
  id: string;
  email?: string | null;
  created_at?: string;
  user_metadata?: Record<string, unknown>;
}): Profile {
  const email = (user.email ?? "").trim();
  const roleMeta = metaString(user.user_metadata, "role");
  let role: UserRole = "customer";
  if (isBootstrapAdminEmail(email)) {
    role = "admin";
  } else if (roleMeta === "vendor") {
    role = "vendor";
  }

  const now = new Date().toISOString();
  return {
    id: user.id,
    email: email || "unknown@user",
    full_name:
      metaString(user.user_metadata, "full_name") ??
      metaString(user.user_metadata, "name"),
    avatar_url: metaString(user.user_metadata, "avatar_url"),
    phone: metaString(user.user_metadata, "phone"),
    role,
    preferred_region_id: null,
    preferred_country_code: metaString(
      user.user_metadata,
      "preferred_country_code",
    ),
    created_at: user.created_at ?? now,
    updated_at: now,
  };
}

/**
 * Load the signed-in user's `profiles` row for the profile page.
 * Self-heals missing rows via ensure_own_profile(), then falls back to
 * Auth user metadata so the UI is never blank for a signed-in account.
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

    // Create the profiles row if the signup trigger never ran.
    const { error: ensureError } = await supabase.rpc("ensure_own_profile");
    if (ensureError) {
      // Older DBs may not have the RPC yet — continue with a direct select.
      console.warn("ensure_own_profile:", ensureError.message);
    }

    // Prefer an explicit column list so a drifted schema still returns fields
    // the profile form maps (instead of a silent empty select("*") failure).
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "id, email, full_name, avatar_url, phone, role, preferred_region_id, preferred_country_code, created_at, updated_at",
      )
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      // Still show Auth-backed fields instead of an empty page.
      const fallback = profileFromAuthUser({
        id: user.id,
        email: user.email,
        created_at: user.created_at,
        user_metadata: user.user_metadata as Record<string, unknown>,
      });
      return {
        ok: true,
        profile: fallback,
        authEmail: user.email,
      };
    }

    if (!data) {
      const fallback = profileFromAuthUser({
        id: user.id,
        email: user.email,
        created_at: user.created_at,
        user_metadata: user.user_metadata as Record<string, unknown>,
      });
      return {
        ok: true,
        profile: fallback,
        authEmail: user.email,
      };
    }

    const row = data as Profile;
    const meta = user.user_metadata as Record<string, unknown>;
    // Prefer Auth email when the profiles.email column is blank.
    const profile: Profile = {
      ...row,
      email: row.email?.trim() ? row.email : user.email ?? row.email,
      full_name:
        row.full_name?.trim()
          ? row.full_name
          : metaString(meta, "full_name") ?? metaString(meta, "name"),
      phone: row.phone?.trim() ? row.phone : metaString(meta, "phone"),
      avatar_url:
        row.avatar_url?.trim()
          ? row.avatar_url
          : metaString(meta, "avatar_url"),
      preferred_country_code:
        row.preferred_country_code?.trim()
          ? row.preferred_country_code
          : metaString(meta, "preferred_country_code"),
    };

    return {
      ok: true,
      profile,
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
