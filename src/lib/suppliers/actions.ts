"use server";

import { revalidatePath } from "next/cache";
import { getSessionProfile, canAccessVendor } from "@/lib/auth/session";
import {
  getExternalProduct,
  parseSupplierKind,
  searchExternalProducts,
  syncExternalInventory,
  type ExternalCatalogProduct,
  type ExternalSupplierKind,
  type SupplierCredentials,
} from "@/lib/suppliers";
import { slugifyExternalName } from "@/lib/suppliers/types";
import { createClient } from "@/lib/supabase/server";
import { getVendorForOwner } from "@/lib/vendors/queries";

export type SupplierCredentialState = {
  error?: string;
  success?: string;
} | null;

export type ExternalImportState = {
  error?: string;
  success?: string;
  productId?: string;
} | null;

async function requireApprovedVendor() {
  const session = await getSessionProfile();
  if (!session || !canAccessVendor(session.role)) {
    return { error: "Sign in as a vendor." as const };
  }
  const vendor = await getVendorForOwner(session.userId);
  if (!vendor) {
    return { error: "Submit a vendor application first." as const };
  }
  if (vendor.status !== "approved") {
    return { error: "Your store must be approved first." as const };
  }
  return { session, vendor };
}

export async function listVendorSupplierCredentials() {
  const gate = await requireApprovedVendor();
  if ("error" in gate) return { error: gate.error, rows: [] as never[] };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vendor_supplier_credentials")
    .select(
      "id, provider_id, account_email, is_active, last_verified_at, updated_at, api_key, access_token",
    )
    .eq("vendor_id", gate.vendor.id);

  if (error) return { error: error.message, rows: [] as never[] };

  const masked = (data ?? []).map((row) => ({
    ...row,
    api_key: row.api_key ? `••••${String(row.api_key).slice(-4)}` : null,
    access_token: row.access_token
      ? `••••${String(row.access_token).slice(-4)}`
      : null,
  }));

  return { rows: masked };
}

export async function saveSupplierCredentialsAction(
  _prev: SupplierCredentialState,
  formData: FormData,
): Promise<SupplierCredentialState> {
  const gate = await requireApprovedVendor();
  if ("error" in gate) return { error: gate.error };

  const providerId = String(formData.get("provider_id") ?? "").trim();
  const apiKey = String(formData.get("api_key") ?? "").trim();
  const apiSecret = String(formData.get("api_secret") ?? "").trim();
  const accessToken = String(formData.get("access_token") ?? "").trim();
  const accountEmail = String(formData.get("account_email") ?? "").trim();

  if (!providerId) return { error: "Choose a supplier platform." };

  const supabase = await createClient();
  const { data: existingCreds } = await supabase
    .from("vendor_supplier_credentials")
    .select("api_key, api_secret, access_token, account_email")
    .eq("vendor_id", gate.vendor.id)
    .eq("provider_id", providerId)
    .maybeSingle();

  const { error } = await supabase.from("vendor_supplier_credentials").upsert(
    {
      vendor_id: gate.vendor.id,
      provider_id: providerId,
      api_key: apiKey || existingCreds?.api_key || null,
      api_secret: apiSecret || existingCreds?.api_secret || null,
      access_token: accessToken || existingCreds?.access_token || null,
      account_email: accountEmail || existingCreds?.account_email || null,
      is_active: true,
      last_verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "vendor_id,provider_id" },
  );

  if (error) return { error: error.message };

  revalidatePath("/vendor/integrations");
  return { success: "Supplier credentials saved." };
}

async function loadVendorCredentials(
  vendorId: string,
  kind: ExternalSupplierKind,
): Promise<{ providerId: string; credentials: SupplierCredentials } | null> {
  const supabase = await createClient();
  const { data: provider } = await supabase
    .from("supplier_providers")
    .select("id, kind")
    .eq("kind", kind)
    .eq("is_active", true)
    .maybeSingle();

  if (!provider) return null;

  const { data: creds } = await supabase
    .from("vendor_supplier_credentials")
    .select(
      "api_key, api_secret, access_token, refresh_token, account_email, metadata",
    )
    .eq("vendor_id", vendorId)
    .eq("provider_id", provider.id)
    .eq("is_active", true)
    .maybeSingle();

  return {
    providerId: provider.id,
    credentials: {
      apiKey: creds?.api_key,
      apiSecret: creds?.api_secret,
      accessToken: creds?.access_token,
      refreshToken: creds?.refresh_token,
      accountEmail: creds?.account_email,
      metadata: (creds?.metadata ?? {}) as Record<string, unknown>,
    },
  };
}

export async function searchSupplierCatalogAction(
  kindRaw: string,
  query: string,
): Promise<{ products: ExternalCatalogProduct[]; error?: string }> {
  const kind = parseSupplierKind(kindRaw);
  if (!kind) return { products: [], error: "Unknown supplier platform." };

  const gate = await requireApprovedVendor();
  if ("error" in gate) return { products: [], error: gate.error };

  const linked = await loadVendorCredentials(gate.vendor.id, kind);
  const products = await searchExternalProducts(
    kind,
    query,
    linked?.credentials ?? null,
  );
  return { products };
}

export async function importExternalSupplierProductAction(
  _prev: ExternalImportState,
  formData: FormData,
): Promise<ExternalImportState> {
  const gate = await requireApprovedVendor();
  if ("error" in gate) return { error: gate.error };

  const kind = parseSupplierKind(String(formData.get("provider_kind") ?? ""));
  const externalProductId = String(
    formData.get("external_product_id") ?? "",
  ).trim();
  const sellPrice = Number(String(formData.get("price") ?? "").trim());
  const regionCode = String(formData.get("region_code") ?? "GLOBAL").trim() || "GLOBAL";

  if (!kind || !externalProductId) {
    return { error: "Select a supplier product to import." };
  }
  if (!Number.isFinite(sellPrice) || sellPrice <= 0) {
    return { error: "Enter a sell price greater than zero." };
  }

  const linked = await loadVendorCredentials(gate.vendor.id, kind);
  if (!linked) {
    return { error: "Supplier provider is not configured in the marketplace." };
  }

  const remote =
    (await getExternalProduct(kind, externalProductId, linked.credentials)) ??
    null;
  if (!remote) {
    return { error: "Could not load that supplier product." };
  }

  if (sellPrice < remote.priceUsdt) {
    return {
      error: `Sell price must be at least supplier cost (${remote.priceUsdt} USDT).`,
    };
  }

  const supabase = await createClient();
  const slugBase = slugifyExternalName(
    `${kind === "cj_dropshipping" ? "cj" : "ae"}-${remote.name}`,
  );
  const slug = `${slugBase}-${Date.now().toString(36).slice(-5)}`;

  const { data: product, error: productError } = await supabase
    .from("products")
    .insert({
      vendor_id: gate.vendor.id,
      name: remote.name.slice(0, 180),
      slug,
      description: remote.description,
      price: sellPrice,
      compare_at_price: remote.compareAtPriceUsdt,
      currency: "USDT",
      sku: remote.externalSku,
      stock_quantity: remote.stockQuantity ?? 0,
      status: "active",
      images: remote.images.length
        ? remote.images
        : remote.imageUrl
          ? [remote.imageUrl]
          : [],
      product_type: "physical",
      // External CJ/DSers listings are owned by the vendor; fulfillment is
      // routed via product_supplier_routes + supplier_fulfillment_jobs.
      is_dropship: false,
      source_product_id: null,
    })
    .select("id")
    .single();

  if (productError || !product) {
    return { error: productError?.message ?? "Failed to create product." };
  }

  const { data: region } = await supabase
    .from("sourcing_regions")
    .select("id, code")
    .eq("code", regionCode)
    .maybeSingle();

  const regionId =
    region?.id ??
    (
      await supabase
        .from("sourcing_regions")
        .select("id")
        .eq("is_default", true)
        .maybeSingle()
    ).data?.id;

  if (regionId) {
    await supabase.from("product_supplier_routes").upsert(
      {
        product_id: product.id,
        region_id: regionId,
        provider_id: linked.providerId,
        external_sku:
          remote.externalVariantId || remote.externalSku || remote.externalProductId,
        warehouse_country: remote.warehouseCountry || "CN",
        shipping_days_min: remote.shippingDaysMin,
        shipping_days_max: remote.shippingDaysMax,
        shipping_cost_usdt: 0,
        priority: 1,
        is_active: true,
      },
      { onConflict: "product_id,region_id,provider_id" },
    );
  }

  await supabase.from("external_product_imports").upsert(
    {
      vendor_id: gate.vendor.id,
      provider_id: linked.providerId,
      product_id: product.id,
      external_product_id: remote.externalProductId,
      external_variant_id: remote.externalVariantId,
      external_sku: remote.externalSku,
      source_payload: remote.raw,
      last_synced_at: new Date().toISOString(),
    },
    { onConflict: "vendor_id,provider_id,external_product_id" },
  );

  revalidatePath("/vendor/products");
  revalidatePath("/vendor/import");
  revalidatePath("/vendor/integrations");
  revalidatePath(`/vendor/sourcing/${product.id}`);

  return {
    success: `Imported “${remote.name}” from ${kind === "cj_dropshipping" ? "CJ" : "DSers"}.`,
    productId: product.id,
  };
}

export async function syncExternalProductInventoryAction(
  productId: string,
): Promise<{ error?: string; success?: string }> {
  const gate = await requireApprovedVendor();
  if ("error" in gate) return { error: gate.error };

  const supabase = await createClient();
  const { data: imported } = await supabase
    .from("external_product_imports")
    .select("external_product_id, provider_id, product_id")
    .eq("product_id", productId)
    .eq("vendor_id", gate.vendor.id)
    .maybeSingle();

  if (!imported) {
    return { error: "This product was not imported from CJ/DSers." };
  }

  const { data: provider } = await supabase
    .from("supplier_providers")
    .select("kind")
    .eq("id", imported.provider_id)
    .maybeSingle();

  const kind = parseSupplierKind(provider?.kind);
  if (!kind) return { error: "Unknown supplier kind." };

  const linked = await loadVendorCredentials(gate.vendor.id, kind);
  const snapshot = await syncExternalInventory(
    kind,
    imported.external_product_id,
    linked?.credentials ?? null,
  );

  const updates: {
    updated_at: string;
    stock_quantity?: number;
    sku?: string | null;
  } = {
    updated_at: new Date().toISOString(),
  };
  if (snapshot.stockQuantity != null) {
    updates.stock_quantity = snapshot.stockQuantity;
  }
  if (snapshot.externalSku) {
    updates.sku = snapshot.externalSku;
  }

  await supabase.from("products").update(updates).eq("id", productId);
  await supabase
    .from("external_product_imports")
    .update({
      last_synced_at: new Date().toISOString(),
      source_payload: snapshot.raw,
      external_sku: snapshot.externalSku,
      external_variant_id: snapshot.externalVariantId,
    })
    .eq("product_id", productId);

  revalidatePath(`/vendor/products/${productId}/edit`);
  revalidatePath("/vendor/products");
  return {
    success: `Synced inventory${
      snapshot.stockQuantity != null ? ` (${snapshot.stockQuantity} units)` : ""
    }.`,
  };
}
