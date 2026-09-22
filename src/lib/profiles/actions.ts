"use server";

import { revalidatePath } from "next/cache";
import { getSessionProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseConfigError, getSupabasePublicEnv } from "@/lib/supabase/env";
import { normalizeCountryCode } from "@/lib/sourcing/constants";

export type ProfileActionState = {
  error?: string;
  success?: string;
} | null;

export async function updateBuyerProfile(
  _prev: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  if (!getSupabasePublicEnv()) {
    return { error: getSupabaseConfigError() };
  }

  const session = await getSessionProfile();
  if (!session) {
    return { error: "Sign in to update your profile." };
  }

  const fullName = String(formData.get("full_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const countryRaw = String(formData.get("preferred_country_code") ?? "")
    .trim()
    .toUpperCase();
  const preferredCountryCode = countryRaw
    ? normalizeCountryCode(countryRaw)
    : null;

  if (!fullName) {
    return { error: "Full name is required." };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName,
        phone: phone || null,
        preferred_country_code: preferredCountryCode,
      })
      .eq("id", session.userId);

    if (error) {
      return { error: error.message };
    }
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Could not update profile.",
    };
  }

  revalidatePath("/profile");
  revalidatePath("/products");
  return { success: "Profile saved." };
}
