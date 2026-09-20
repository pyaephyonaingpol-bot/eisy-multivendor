import { createClient } from "@/lib/supabase/server";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import type {
  Vendor,
  VendorKycStatus,
  VendorStatus,
} from "@/lib/types/database";

function normalizeVendor(row: Vendor & { user_id?: string | null }): Vendor {
  const ownerId = row.owner_id || row.user_id;
  if (!ownerId) {
    throw new Error("Vendor row is missing owner_id/user_id");
  }
  return {
    ...row,
    owner_id: ownerId,
    kyc_status: (row.kyc_status ?? "unsubmitted") as VendorKycStatus,
    kyc_document_type: row.kyc_document_type ?? null,
    kyc_document_url: row.kyc_document_url ?? null,
    kyc_document_path: row.kyc_document_path ?? null,
    kyc_legal_name: row.kyc_legal_name ?? null,
    kyc_document_number: row.kyc_document_number ?? null,
    kyc_submitted_at: row.kyc_submitted_at ?? null,
    kyc_reviewed_at: row.kyc_reviewed_at ?? null,
    kyc_reviewed_by: row.kyc_reviewed_by ?? null,
    kyc_rejection_reason: row.kyc_rejection_reason ?? null,
    ships_to_region_ids: Array.isArray(row.ships_to_region_ids)
      ? row.ships_to_region_ids
      : [],
  };
}

export async function getVendorForOwner(ownerId: string): Promise<Vendor | null> {
  if (!getSupabasePublicEnv()) {
    return null;
  }

  const supabase = await createClient();

  // Prefer owner_id (canonical). Fall back to user_id for older schemas.
  const primary = await supabase
    .from("vendors")
    .select("*")
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (!primary.error && primary.data) {
    return normalizeVendor(primary.data as Vendor);
  }

  // Legacy column name on some Supabase projects.
  const fallback = await supabase
    .from("vendors")
    .select("*")
    .eq("user_id" as "owner_id", ownerId)
    .maybeSingle();

  return fallback.data
    ? normalizeVendor(fallback.data as Vendor & { user_id?: string })
    : null;
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
  return ((data as Vendor[] | null) ?? []).map(normalizeVendor);
}

export async function listVendorsForKycAdmin(
  kycStatus?: VendorKycStatus,
): Promise<Vendor[]> {
  if (!getSupabasePublicEnv()) {
    return [];
  }

  const supabase = await createClient();
  let query = supabase
    .from("vendors")
    .select("*")
    .order("kyc_submitted_at", { ascending: false, nullsFirst: false });

  if (kycStatus) {
    query = query.eq("kyc_status", kycStatus);
  } else {
    query = query.in("kyc_status", ["pending", "approved", "rejected"]);
  }

  const { data } = await query;
  return ((data as Vendor[] | null) ?? []).map(normalizeVendor);
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

  return data ? normalizeVendor(data as Vendor) : null;
}

export function isVendorKycApproved(
  vendor: Pick<Vendor, "kyc_status"> | null | undefined,
) {
  return vendor?.kyc_status === "approved";
}
