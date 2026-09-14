"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isBootstrapAdminEmail } from "@/lib/auth/constants";
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

export async function login(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();
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
      return { error: error.message };
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Sign-in failed. Please try again.",
    };
  }

  redirect(next);
}

export async function register(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const role = signupRole(formData.get("role"));

  if (!fullName || !email || !password) {
    return { error: "Name, email, and password are required." };
  }

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
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
        },
        ...(origin ? { emailRedirectTo: `${origin}/auth/callback` } : {}),
      },
    });

    if (error) {
      return { error: error.message };
    }

    // Email confirmation may be enabled — no session until the user confirms.
    if (!data.session) {
      return {
        success: "Account created. Check your email to confirm, then sign in.",
      };
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Registration failed. Please try again.",
    };
  }

  if (isBootstrapAdminEmail(email)) {
    redirect("/admin/dashboard");
  }

  redirect(role === "vendor" ? "/vendor/apply" : "/");
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
