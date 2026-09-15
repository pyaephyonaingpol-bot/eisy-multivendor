"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { collectLogoFile, uploadVendorLogo } from "@/lib/vendors/branding";
import { collectKycDocumentFile, uploadVendorKycDocument } from "@/lib/vendors/kyc";
import { getVendorForOwner } from "@/lib/vendors/queries";
import type { VendorStatus } from "@/lib/types/database";

export type VendorActionState = {
  error?: string;
  success?: string;
} | null;

function normalizeSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function applyForVendor(
  _prev: VendorActionState,
  formData: FormData,
): Promise<VendorActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const slugInput = String(formData.get("slug") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const slug = normalizeSlug(slugInput || name);

  if (!name) {
    return { error: "Store name is required." };
  }

  if (!slug) {
    return { error: "Store URL slug is required." };
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return { error: "Slug must use lowercase letters, numbers, and hyphens." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to apply." };
  }

  const { error } = await supabase.rpc("apply_for_vendor", {
    p_name: name,
    p_slug: slug,
    p_description: description || null,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/vendor/dashboard");
  revalidatePath("/vendor/apply");
  revalidatePath("/admin/vendors");
  redirect("/vendor/dashboard");
}

export async function reviewVendor(
  vendorId: string,
  status: Extract<VendorStatus, "approved" | "rejected" | "suspended">,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/admin/vendors");
  }

  const { error } = await supabase.rpc("review_vendor", {
    p_vendor_id: vendorId,
    p_status: status,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/vendors");
  revalidatePath("/admin/dashboard");
  revalidatePath("/vendor/dashboard");
  revalidatePath("/vendors");
  revalidatePath("/store");
}


export async function updateVendorStoreBranding(
  _prev: VendorActionState,
  formData: FormData,
): Promise<VendorActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const slugInput = String(formData.get("slug") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const clearLogo = String(formData.get("clear_logo") ?? "") === "1";
  const slug = normalizeSlug(slugInput || name);

  if (!name) {
    return { error: "Store name is required." };
  }

  if (!slug) {
    return { error: "Store URL slug is required." };
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return { error: "Slug must use lowercase letters, numbers, and hyphens." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in." };
  }

  const vendor = await getVendorForOwner(user.id);
  if (!vendor) {
    return { error: "Create a store application before editing branding." };
  }

  let logoUrl = vendor.logo_url;
  const logoFile = collectLogoFile(formData);

  if (clearLogo) {
    logoUrl = null;
  }

  if (logoFile) {
    const uploaded = await uploadVendorLogo(vendor.id, logoFile);
    if (uploaded.error || !uploaded.url) {
      return { error: uploaded.error ?? "Could not upload logo." };
    }
    logoUrl = uploaded.url;
  }

  // Enforce unique slug when changing (exclude self).
  if (slug !== vendor.slug) {
    const { data: conflict } = await supabase
      .from("vendors")
      .select("id")
      .eq("slug", slug)
      .neq("id", vendor.id)
      .maybeSingle();
    if (conflict) {
      return { error: "That store URL is already taken. Choose another slug." };
    }
  }

  const { error } = await supabase
    .from("vendors")
    .update({
      name,
      slug,
      description: description || null,
      logo_url: logoUrl,
      updated_at: new Date().toISOString(),
    })
    .eq("id", vendor.id)
    .eq("owner_id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/vendor/settings");
  revalidatePath("/vendor/dashboard");
  revalidatePath("/vendor/apply");
  revalidatePath(`/store/${slug}`);
  if (vendor.slug !== slug) {
    revalidatePath(`/store/${vendor.slug}`);
  }
  revalidatePath("/products");
  revalidatePath("/");

  return { success: "Store branding saved." };
}

export async function submitVendorKyc(
  _prev: VendorActionState,
  formData: FormData,
): Promise<VendorActionState> {
  const documentType = String(formData.get("document_type") ?? "").trim().toLowerCase();
  const legalName = String(formData.get("legal_name") ?? "").trim();
  const documentNumber = String(formData.get("document_number") ?? "").trim();

  if (!["passport", "national_id", "trade_license"].includes(documentType)) {
    return { error: "Choose passport, national ID, or trade license." };
  }

  if (!legalName) {
    return { error: "Legal name is required." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in." };
  }

  const vendor = await getVendorForOwner(user.id);
  if (!vendor) {
    return { error: "Create a store application before submitting KYC." };
  }

  if (vendor.kyc_status === "approved") {
    return { error: "KYC is already approved." };
  }

  if (vendor.kyc_status === "pending") {
    return { error: "KYC is already pending review." };
  }

  const file = collectKycDocumentFile(formData);
  if (!file) {
    return { error: "Upload a passport, ID card, or trade license document." };
  }

  const uploaded = await uploadVendorKycDocument(vendor.id, file);
  if (uploaded.error || !uploaded.path) {
    return { error: uploaded.error ?? "Could not upload KYC document." };
  }

  const { error } = await supabase.rpc("submit_vendor_kyc", {
    p_document_type: documentType,
    p_document_path: uploaded.path,
    p_document_url: uploaded.url ?? "",
    p_legal_name: legalName,
    p_document_number: documentNumber || null,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/vendor/settings");
  revalidatePath("/vendor/dashboard");
  revalidatePath("/vendor/products");
  revalidatePath("/vendor/wallet");
  revalidatePath("/admin/kyc");

  return { success: "KYC submitted for admin review." };
}

export async function reviewVendorKyc(
  vendorId: string,
  approve: boolean,
  rejectionReason?: string | null,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/admin/kyc");
  }

  const { error } = await supabase.rpc("review_vendor_kyc", {
    p_vendor_id: vendorId,
    p_approve: approve,
    p_rejection_reason: approve ? null : rejectionReason || null,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/kyc");
  revalidatePath("/admin/vendors");
  revalidatePath("/admin/dashboard");
  revalidatePath("/vendor/settings");
  revalidatePath("/vendor/dashboard");
  revalidatePath("/vendor/products");
  revalidatePath("/vendor/wallet");

  return {};
}

export async function updateVendorShippingRegions(
  _prev: VendorActionState,
  formData: FormData,
): Promise<VendorActionState> {
  const regionIds = formData
    .getAll("ships_to_region_ids")
    .map((value) => String(value).trim())
    .filter((value) => /^[0-9a-f-]{36}$/i.test(value));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in." };
  }

  const vendor = await getVendorForOwner(user.id);
  if (!vendor) {
    return { error: "Create a store application before editing shipping regions." };
  }

  // Drop unknown / inactive ids so stale form values cannot stick.
  let shipsToRegionIds = regionIds;
  if (regionIds.length > 0) {
    const { data: validRows, error: regionsError } = await supabase
      .from("sourcing_regions")
      .select("id")
      .eq("is_active", true)
      .in("id", regionIds);

    if (regionsError) {
      return { error: regionsError.message };
    }

    const valid = new Set(
      ((validRows as { id: string }[] | null) ?? []).map((row) => row.id),
    );
    shipsToRegionIds = regionIds.filter((id) => valid.has(id));
  }

  const { error } = await supabase
    .from("vendors")
    .update({
      ships_to_region_ids: shipsToRegionIds,
      updated_at: new Date().toISOString(),
    })
    .eq("id", vendor.id)
    .eq("owner_id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/vendor/settings");
  revalidatePath("/vendor/dashboard");
  revalidatePath(`/store/${vendor.slug}`);
  revalidatePath("/products");
  revalidatePath("/");

  return {
    success:
      shipsToRegionIds.length === 0
        ? "Shipping regions cleared — your listings ship worldwide."
        : "Shipping regions saved.",
  };
}
