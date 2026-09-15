import { createClient } from "@/lib/supabase/server";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import type { Vendor, VendorStatus } from "@/lib/types/database";

export async function getVendorForOwner(ownerId: string): Promise<Vendor | null> {
  if (!getSupabasePublicEnv()) {
    return null;
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("vendors")
    .select("*")
    .eq("owner_id", ownerId)
    .maybeSingle();

  return (data as Vendor | null) ?? null;
}

export async function listVendorsForAdmin(status?: VendorStatus): Promise<Vendor[]> {
  if (!getSupabasePublicEnv()) {
    return [];
  }

  const supabase = await createClient();
  let query = supabase
    .from("vendors")
    .select("*")
    .order("created_at", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  }

  const { data } = await query;
  return (data as Vendor[] | null) ?? [];
}

/** Public storefront lookup — approved vendors only. */
export async function getApprovedVendorBySlug(
  slug: string,
): Promise<Vendor | null> {
  if (!getSupabasePublicEnv()) {
    return null;
  }

  const normalized = slug.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("vendors")
    .select("*")
    .eq("slug", normalized)
    .eq("status", "approved")
    .maybeSingle();

  return (data as Vendor | null) ?? null;
}
