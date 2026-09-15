"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { collectLogoFile, uploadVendorLogo } from "@/lib/vendors/branding";
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
