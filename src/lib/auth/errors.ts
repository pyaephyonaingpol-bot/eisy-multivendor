/** Normalize emails for Supabase Auth (trim + lowercase). */
export function normalizeAuthEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Human-friendly Auth error messages for sign-in / sign-up. */
export function formatAuthError(message: string | null | undefined): string {
  const raw = String(message ?? "").trim();
  const lower = raw.toLowerCase();

  if (!raw) {
    return "Authentication failed. Please try again.";
  }

  if (
    lower.includes("invalid login credentials") ||
    lower.includes("invalid email or password")
  ) {
    return "Email or password is incorrect. Use the password from Sign up, or reset it. Having an email in profiles is not enough without a matching Auth password.";
  }

  if (
    lower.includes("user already registered") ||
    lower.includes("already been registered") ||
    lower.includes("email address is already")
  ) {
    return "An account with this email already exists. Sign in instead, or reset your password.";
  }

  if (
    lower.includes("database error creating new user") ||
    lower.includes("database error saving new user")
  ) {
    return "Could not create your account (profiles link failed). Ask an admin to run fix_auth_profiles_linkage.sql, then try again.";
  }

  if (lower.includes("email not confirmed")) {
    return "Confirm your email before signing in. Check your inbox for the confirmation link.";
  }

  return raw;
}

/**
 * Supabase sometimes returns a 200 signUp with an empty identities array when
 * the email is already registered (and email confirmation is enabled).
 */
export function isLikelyExistingAccount(user: {
  identities?: Array<unknown> | null;
} | null | undefined): boolean {
  return Array.isArray(user?.identities) && user.identities.length === 0;
}
