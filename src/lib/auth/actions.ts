"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isBootstrapAdminEmail } from "@/lib/auth/constants";
import {
  formatAuthError,
  isLikelyExistingAccount,
  normalizeAuthEmail,
} from "@/lib/auth/errors";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseConfigError, getSupabasePublicEnv } from "@/lib/supabase/env";
import type { UserRole } from "@/lib/types/database";

export type AuthActionState = {
  error?: string;
  success?: string;
} | null;

function safeNextPath(next: FormDataEntryValue | null): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//")) {
    return "/";
  }
  return next;
}

function signupRole(value: FormDataEntryValue | null): Extract<UserRole, "customer" | "vendor"> {
  return value === "vendor" ? "vendor" : "customer";
}

async function getSiteOrigin() {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  }

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  return host ? `${proto}://${host}` : undefined;
}

async function ensureProfileAfterAuth(supabase: {
  rpc: (
    fn: "ensure_own_profile",
  ) => PromiseLike<{ error: { message: string } | null }>;
}) {
  try {
    const { error } = await supabase.rpc("ensure_own_profile");
    if (error) {
      console.warn("ensure_own_profile:", error.message);
    }
  } catch {
    // RPC may be missing until the linkage migration is applied.
  }
}

export async function login(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = normalizeAuthEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(formData.get("next"));

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  if (!getSupabasePublicEnv()) {
    return { error: getSupabaseConfigError() };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      return { error: formatAuthError(error.message) };
    }

    await ensureProfileAfterAuth(supabase);
  } catch (error) {
    return {
      error: formatAuthError(
        error instanceof Error ? error.message : "Sign-in failed. Please try again.",
      ),
    };
  }

  redirect(next);
}

export async function register(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = normalizeAuthEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");
  const role = signupRole(formData.get("role"));
  const saveDelivery =
    String(formData.get("save_delivery_address") ?? "") === "1";
  const addressLine1 = String(formData.get("address_line1") ?? "").trim();
  const addressCity = String(formData.get("address_city") ?? "").trim();
  const addressCountry = String(formData.get("address_country") ?? "")
    .trim()
    .toUpperCase();
  const addressIsDefault =
    String(formData.get("address_is_default") ?? "") === "1" ||
    String(formData.get("address_is_default") ?? "").toLowerCase() === "on";

  if (!fullName || !email || !password) {
    return { error: "Name, email, and password are required." };
  }

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  if (saveDelivery && (!addressLine1 || !addressCity || !addressCountry)) {
    return {
      error:
        "Delivery address needs line 1, city, and country when enabled.",
    };
  }

  if (!getSupabasePublicEnv()) {
    return { error: getSupabaseConfigError() };
  }

  try {
    const origin = await getSiteOrigin();
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          // Never send "admin" from the client. Bootstrap admin is assigned in
          // handle_new_user() when email matches BOOTSTRAP_ADMIN_EMAIL.
          role: isBootstrapAdminEmail(email) ? "customer" : role,
          ...(saveDelivery && addressCountry
            ? { preferred_country_code: addressCountry }
            : {}),
        },
        ...(origin ? { emailRedirectTo: `${origin}/auth/callback` } : {}),
      },
    });

    if (error) {
      return { error: formatAuthError(error.message) };
    }

    if (isLikelyExistingAccount(data.user)) {
      return {
        error:
          "An account with this email already exists. Sign in instead, or reset your password.",
      };
    }

    if (data.session) {
      await ensureProfileAfterAuth(supabase);
    }

    // Persist optional default delivery address when we already have a session.
    if (saveDelivery && data.user?.id && data.session) {
      try {
        const { normalizeCountryCode } = await import(
          "@/lib/sourcing/constants"
        );
        await supabase.from("buyer_addresses").insert({
          user_id: data.user.id,
          label: "Default",
          full_name: fullName,
          phone: String(formData.get("address_phone") ?? "").trim() || null,
          line1: addressLine1,
          line2: String(formData.get("address_line2") ?? "").trim() || null,
          city: addressCity,
          region: String(formData.get("address_region") ?? "").trim() || null,
          postal_code:
            String(formData.get("address_postal_code") ?? "").trim() || null,
          country_code: normalizeCountryCode(addressCountry),
          is_default: addressIsDefault,
        });
        await supabase
          .from("profiles")
          .update({
            preferred_country_code: normalizeCountryCode(addressCountry),
            phone: String(formData.get("address_phone") ?? "").trim() || null,
          })
          .eq("id", data.user.id);
      } catch {
        // Account was created; address can be added later from profile.
      }
    }

    // Email confirmation may be enabled — no session until the user confirms.
    if (!data.session) {
      return {
        success: saveDelivery
          ? "Account created. Confirm your email, then sign in to finish saving your delivery address from Profile if needed."
          : "Account created. Check your email to confirm, then sign in.",
      };
    }
  } catch (error) {
    return {
      error: formatAuthError(
        error instanceof Error ? error.message : "Registration failed. Please try again.",
      ),
    };
  }

  if (isBootstrapAdminEmail(email)) {
    redirect("/admin/dashboard");
  }

  redirect(role === "vendor" ? "/vendor/apply" : "/");
}

export async function requestPasswordReset(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = normalizeAuthEmail(String(formData.get("email") ?? ""));

  if (!email) {
    return { error: "Email is required." };
  }

  if (!getSupabasePublicEnv()) {
    return { error: getSupabaseConfigError() };
  }

  try {
    const origin = await getSiteOrigin();
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: origin ? `${origin}/auth/callback?next=/profile` : undefined,
    });

    if (error) {
      return { error: formatAuthError(error.message) };
    }

    return {
      success:
        "If an Auth account exists for that email, a password reset link has been sent.",
    };
  } catch (error) {
    return {
      error: formatAuthError(
        error instanceof Error ? error.message : "Could not send reset email.",
      ),
    };
  }
}

export async function signOut(): Promise<void> {
  if (getSupabasePublicEnv()) {
    try {
      const supabase = await createClient();
      await supabase.auth.signOut();
    } catch {
      // Still clear the local session route even if Supabase is unreachable.
    }
  }

  redirect("/");
}
