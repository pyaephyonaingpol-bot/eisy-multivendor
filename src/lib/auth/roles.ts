import type { UserRole } from "@/lib/types/database";
import { isBootstrapAdminEmail } from "@/lib/auth/constants";

/** Normalize DB / RPC role strings for comparisons. */
export function normalizeUserRole(
  role: string | null | undefined,
): UserRole | null {
  const value = String(role ?? "")
    .trim()
    .toLowerCase();
  // Live DBs may still store legacy "buyer" instead of "customer".
  if (value === "buyer" || value === "customer") {
    return "customer";
  }
  if (value === "seller" || value === "vendor") {
    return "vendor";
  }
  if (value === "admin") {
    return "admin";
  }
  return null;
}

/**
 * Resolve the signed-in user's app role.
 * Prefers security-definer RPC (bypasses RLS), then profiles table, then
 * bootstrap admin email allowlist.
 */
export async function resolveUserRole(options: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: { rpc: any; from: any };
  userId: string;
  email?: string | null;
}): Promise<UserRole | null> {
  const { supabase, userId, email } = options;

  const { data: rpcRole, error: rpcError } = await supabase.rpc("get_my_role");
  if (!rpcError && rpcRole != null) {
    const normalized = normalizeUserRole(
      typeof rpcRole === "string" ? rpcRole : String(rpcRole),
    );
    if (normalized) return normalized;
  }

  const { data: byId } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  const roleById = normalizeUserRole(
    (byId as { role?: string } | null)?.role,
  );
  if (roleById) return roleById;

  if (email) {
    const { data: byEmail } = await supabase
      .from("profiles")
      .select("role")
      .ilike("email", email.trim())
      .maybeSingle();

    const roleByEmail = normalizeUserRole(
      (byEmail as { role?: string } | null)?.role,
    );
    if (roleByEmail) return roleByEmail;

    if (isBootstrapAdminEmail(email)) {
      return "admin";
    }
  }

  return null;
}

export function canAccessVendor(role: UserRole | null | undefined) {
  return normalizeUserRole(role) === "vendor" || normalizeUserRole(role) === "admin";
}

export function canAccessAdmin(role: UserRole | null | undefined) {
  return normalizeUserRole(role) === "admin";
}
