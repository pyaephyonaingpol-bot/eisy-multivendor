"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { collectLogoFile, uploadVendorLogo } from "@/lib/vendors/branding";
import { collectKycDocumentFile, uploadVendorKycDocument } from "@/lib/vendors/kyc";
import { getVendorForOwner } from "@/lib/vendors/queries";
import type { VendorStatus } from "@/lib/types/database";

export type VendorActionState = {
  error?: string;
  success?: string;
} | null;

/** Update a vendor row owned by the authenticated user (canonical owner_id). */
async function updateOwnedVendor(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  vendorId: string,
  userId: string,
  values: Record<string, unknown>,
) {
  return supabase
    .from("vendors")
    .update(values)
    .eq("id", vendorId)
    .eq("owner_id", userId);
}

function normalizeSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Insert a pending vendor row with an explicit UUID (never rely on column DEFAULT). */
async function insertVendorApplication(options: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userClient: any;
  userId: string;
  vendorId: string;
  name: string;
  storeName: string;
  slug: string;
  description: string | null;
}): Promise<{ error: string | null }> {
  const { userClient, userId, vendorId, name, storeName, slug, description } =
    options;

  // Prefer service role so RLS / missing insert policies cannot block apply.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let serviceClient: any = null;
  try {
    serviceClient = createServiceClient();
  } catch {
    serviceClient = null;
  }

  const clients = [serviceClient, userClient].filter(Boolean);

  // Always include store_name — live DB treats it as NOT NULL.
  const row = {
    id: vendorId,
    owner_id: userId,
    name,
    store_name: storeName,
    slug,
    description,
    status: "pending" as const,
  };

  let lastMessage: string | null = null;

  for (const client of clients) {
    const { error } = await client.from("vendors").insert(row);
    if (!error) {
      return { error: null };
    }
    const message = String(error.message ?? "Failed to create vendor application.");
    lastMessage = message;

    // Already applied — treat as success for idempotent resubmits.
    if (/already have a vendor|duplicate key|unique constraint/i.test(message)) {
      const existing = await getVendorForOwner(userId);
      if (existing) {
        return { error: null };
      }
    }
  }

  return { error: lastMessage ?? "Failed to create vendor application." };
}

async function promoteProfileToVendor(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userClient: any,
  userId: string,
) {
  // Best-effort: protect_profile_role may block non-RPC updates.
  const { error: userErr } = await userClient
    .from("profiles")
    .update({ role: "vendor" })
    .eq("id", userId)
    .eq("role", "customer");

  if (!userErr) {
    return;
  }

  try {
    const serviceClient = createServiceClient();
    await serviceClient
      .from("profiles")
      .update({ role: "vendor" })
      .eq("id", userId)
      .eq("role", "customer");
  } catch {
    // Middleware also allows /vendor/* when a vendors row exists.
  }
}

export async function applyForVendor(
  _prev: VendorActionState,
  formData: FormData,
): Promise<VendorActionState> {
  const name = String(formData.get("name") ?? "").trim();
  // Form uses "name" as the store display name; accept store_name if present.
  const storeName = String(
    formData.get("store_name") ?? formData.get("name") ?? "",
  ).trim();
  const slugInput = String(formData.get("slug") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const slug = normalizeSlug(slugInput || storeName || name);

  if (!name && !storeName) {
    return { error: "Store name is required." };
  }

  const resolvedName = name || storeName;
  const resolvedStoreName = storeName || name;

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

  const existing = await getVendorForOwner(user.id);
  if (existing) {
    redirect("/vendor/dashboard");
  }

  // Always supply id + store_name — live DBs often lack defaults / treat them NOT NULL.
  const vendorId = randomUUID();
  const inserted = await insertVendorApplication({
    userClient: supabase,
    userId: user.id,
    vendorId,
    name: resolvedName,
    storeName: resolvedStoreName,
    slug,
    description: description || null,
  });

  if (inserted.error) {
    return { error: inserted.error };
  }

  await promoteProfileToVendor(supabase, user.id);

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

  const { error } = await updateOwnedVendor(supabase, vendor.id, user.id, {
    name,
    slug,
    description: description || null,
    logo_url: logoUrl,
    updated_at: new Date().toISOString(),
  });

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

  const { error } = await updateOwnedVendor(supabase, vendor.id, user.id, {
    ships_to_region_ids: shipsToRegionIds,
    updated_at: new Date().toISOString(),
  });

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

export async function updateVendorContactProfile(
  _prev: VendorActionState,
  formData: FormData,
): Promise<VendorActionState> {
  const storeName = String(formData.get("store_name") ?? "").trim();
  const contactEmail = String(formData.get("contact_email") ?? "").trim();
  const telegramHandle = String(formData.get("telegram_handle") ?? "").trim();
  const usdtPayoutAddress = String(
    formData.get("usdt_payout_address") ?? "",
  ).trim();

  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    return { error: "Enter a valid contact email." };
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
    return { error: "Create a store before editing contact details." };
  }

  const { error } = await supabase.rpc("update_vendor_contact_profile", {
    p_vendor_id: vendor.id,
    p_store_name: storeName || null,
    p_contact_email: contactEmail || null,
    p_telegram_handle: telegramHandle,
    p_usdt_payout_address: usdtPayoutAddress,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/vendor/settings");
  revalidatePath("/admin/orders");
  revalidatePath("/admin/transactions");

  return { success: "Contact and payout details saved." };
}
