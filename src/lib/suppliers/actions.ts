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
import {
  ONE_CLICK_IMPORT_MARKUP,
  slugifyExternalName,
} from "@/lib/suppliers/types";
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
  /** True when the listing was created via one-click default pricing. */
  oneClick?: boolean;
} | null;

function resolveImportSellPrice(
  formData: FormData,
  supplierCostUsdt: number,
): { price: number; oneClick: boolean } | { error: string } {
  const oneClick =
    String(formData.get("one_click") ?? "").trim() === "1" ||
    String(formData.get("one_click") ?? "").trim() === "true";
  const rawPrice = String(formData.get("price") ?? "").trim();
  const parsed = rawPrice === "" ? NaN : Number(rawPrice);

  if (oneClick || !Number.isFinite(parsed) || parsed <= 0) {
    if (!oneClick && rawPrice !== "") {
      return { error: "Enter a sell price greater than zero." };
    }
    const price =
      Math.round(Math.max(supplierCostUsdt, 0.01) * ONE_CLICK_IMPORT_MARKUP * 100) /
      100;
    return { price, oneClick: true };
  }

  return { price: Math.round(parsed * 100) / 100, oneClick: false };
}

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


/** Ensure MM + GLOBAL (+ requested) supplier routes exist for external imports. */
async function upsertExternalSupplierRoutes(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  productId: string;
  providerId: string;
  remote: ExternalCatalogProduct;
  regionCode: string;
}) {
  const { supabase, productId, providerId, remote, regionCode } = params;
  const codes = Array.from(
    new Set(
      [regionCode, "MM", "GLOBAL"]
        .map((code) => code.trim().toUpperCase())
        .filter(Boolean),
    ),
  );

  const { data: regions } = await supabase
    .from("sourcing_regions")
    .select("id, code")
    .in("code", codes);

  let regionRows = regions ?? [];
  if (regionRows.length === 0) {
    const { data: fallback } = await supabase
      .from("sourcing_regions")
      .select("id, code")
      .eq("is_default", true)
      .maybeSingle();
    if (fallback) regionRows = [fallback];
  }

  const externalSku =
    remote.externalVariantId ||
    remote.externalSku ||
    remote.externalProductId;

  for (const region of regionRows) {
    await supabase.from("product_supplier_routes").upsert(
      {
        product_id: productId,
        region_id: region.id,
        provider_id: providerId,
        external_sku: externalSku,
        warehouse_country: remote.warehouseCountry || "CN",
        shipping_days_min: remote.shippingDaysMin,
        shipping_days_max: remote.shippingDaysMax,
        shipping_cost_usdt: 0,
        priority: region.code === "MM" ? 1 : 2,
        is_active: true,
      },
      { onConflict: "product_id,region_id,provider_id" },
    );
  }
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
  const regionCode =
    String(formData.get("region_code") ?? "GLOBAL").trim() || "GLOBAL";

  if (!kind || !externalProductId) {
    return { error: "Select a supplier product to import." };
  }

  // Credentials are optional in mock mode; provider rows may be absent until
  // supplier migrations are applied to the project.
  const linked = await loadVendorCredentials(gate.vendor.id, kind);
  const remote =
    (await getExternalProduct(
      kind,
      externalProductId,
      linked?.credentials ?? null,
    )) ?? null;
  if (!remote) {
    return { error: "Could not load that supplier product." };
  }

  const priced = resolveImportSellPrice(formData, remote.priceUsdt);
  if ("error" in priced) {
    return { error: priced.error };
  }
  const { price: sellPrice, oneClick } = priced;

  if (sellPrice < remote.priceUsdt) {
    return {
      error: `Sell price must be at least supplier cost (${remote.priceUsdt} USDT).`,
    };
  }

  const supabase = await createClient();

  function isMissingSchemaError(message: string | undefined) {
    if (!message) return false;
    const m = message.toLowerCase();
    return (
      m.includes("schema cache") ||
      m.includes("could not find the table") ||
      m.includes("could not find the function") ||
      m.includes("does not exist")
    );
  }

  const productImages = remote.images.length
    ? remote.images
    : remote.imageUrl
      ? [remote.imageUrl]
      : [];

  // Re-import of the same external SKU updates the existing listing (no new quota slot).
  if (linked?.providerId) {
    const { data: existingImport, error: existingError } = await supabase
      .from("external_product_imports")
      .select("id, product_id")
      .eq("vendor_id", gate.vendor.id)
      .eq("provider_id", linked.providerId)
      .eq("external_product_id", remote.externalProductId)
      .maybeSingle();

    if (existingError && !isMissingSchemaError(existingError.message)) {
      return { error: existingError.message };
    }

    if (existingImport?.product_id) {
      const { error: updateError } = await supabase
        .from("products")
        .update({
          name: remote.name.slice(0, 180),
          description: remote.description,
          price: sellPrice,
          compare_at_price: remote.compareAtPriceUsdt,
          sku: remote.externalSku,
          stock_quantity: remote.stockQuantity ?? 0,
          images: productImages,
          is_dropship: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingImport.product_id)
        .eq("vendor_id", gate.vendor.id);

      if (updateError) {
        return { error: updateError.message };
      }

      await supabase
        .from("external_product_imports")
        .update({
          external_variant_id: remote.externalVariantId,
          external_sku: remote.externalSku,
          source_payload: remote.raw,
          last_synced_at: new Date().toISOString(),
        })
        .eq("id", existingImport.id);

      await upsertExternalSupplierRoutes({
        supabase,
        productId: existingImport.product_id,
        providerId: linked.providerId,
        remote,
        regionCode,
      });

      revalidatePath("/vendor/products");
      revalidatePath("/vendor/import");
      revalidatePath("/vendor/integrations");
      revalidatePath(`/vendor/sourcing/${existingImport.product_id}`);

      return {
        success: `Updated imported “${remote.name}” from ${
          kind === "cj_dropshipping" ? "CJ" : "DSers"
        }.`,
        productId: existingImport.product_id,
        oneClick,
      };
    }
  } else if (remote.externalSku) {
    // Fallback dedupe when import-tracking tables are not migrated yet.
    const { data: existingBySku } = await supabase
      .from("products")
      .select("id")
      .eq("vendor_id", gate.vendor.id)
      .eq("sku", remote.externalSku)
      .maybeSingle();

    if (existingBySku?.id) {
      const { error: updateError } = await supabase
        .from("products")
        .update({
          name: remote.name.slice(0, 180),
          description: remote.description,
          price: sellPrice,
          compare_at_price: remote.compareAtPriceUsdt,
          stock_quantity: remote.stockQuantity ?? 0,
          images: productImages,
          is_dropship: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingBySku.id)
        .eq("vendor_id", gate.vendor.id);

      if (updateError) {
        return { error: updateError.message };
      }

      revalidatePath("/vendor/products");
      revalidatePath("/vendor/integrations");

      return {
        success: `Updated imported “${remote.name}” from ${
          kind === "cj_dropshipping" ? "CJ" : "DSers"
        }.`,
        productId: existingBySku.id,
        oneClick,
      };
    }
  }

  // Max import cap (plan / system / vendor override). Min active (10) is a fee
  // floor — imports are allowed below it; we surface guidance after success.
  const { data: quotaBefore, error: quotaError } = await supabase.rpc(
    "assert_vendor_can_import_product",
    {
      p_vendor_id: gate.vendor.id,
      p_is_new_catalog_item: true,
    },
  );
  void quotaBefore;
  if (quotaError && !isMissingSchemaError(quotaError.message)) {
    return {
      error:
        quotaError.message ||
        "Import limit reached. Archive listings or upgrade your plan.",
    };
  }

  const { data: quotaSnapshot } = await supabase.rpc("get_vendor_import_quota", {
    p_vendor_id: gate.vendor.id,
  });
  const quota = (quotaSnapshot ?? {}) as {
    active_item_count?: number;
    min_active_items?: number;
    catalog_item_count?: number;
    max_import_items?: number;
    item_fee_usdt?: number;
  };
  const minActive = Number(quota.min_active_items ?? 10);
  const itemFee = Number(quota.item_fee_usdt ?? 1);
  const activeBefore = Number(quota.active_item_count ?? 0);
  const catalogBefore = Number(quota.catalog_item_count ?? 0);
  const maxImports = Number(quota.max_import_items ?? 100);

  // When quota RPCs are unavailable, enforce a local active-catalog cap of 100.
  if (!quotaSnapshot) {
    const { count } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("vendor_id", gate.vendor.id)
      .neq("status", "archived");
    if ((count ?? 0) >= maxImports) {
      return {
        error: `Import limit reached (${count}/${maxImports}). Archive listings or upgrade your plan.`,
      };
    }
  }

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
      images: productImages,
      product_type: "physical",
      is_dropship: true,
    })
    .select("id")
    .single();

  if (productError || !product) {
    return { error: productError?.message ?? "Failed to create product." };
  }

  if (linked?.providerId) {
    await upsertExternalSupplierRoutes({
      supabase,
      productId: product.id,
      providerId: linked.providerId,
      remote,
      regionCode,
    });

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
  }

  revalidatePath("/vendor/products");
  revalidatePath("/vendor/import");
  revalidatePath("/vendor/integrations");
  revalidatePath("/vendor/sourcing");
  revalidatePath(`/vendor/sourcing/${product.id}`);

  const activeAfter = activeBefore + 1;
  const catalogAfter = catalogBefore + 1;
  const platform = kind === "cj_dropshipping" ? "CJ" : "DSers";
  const priceNote = oneClick
    ? ` Listed at ${sellPrice.toFixed(2)} USDT (${Math.round((ONE_CLICK_IMPORT_MARKUP - 1) * 100)}% markup).`
    : "";
  const quotaNote =
    activeAfter < minActive
      ? ` Active catalog ${activeAfter}/${minActive} toward the ${minActive}-item fee floor (${(minActive * itemFee).toFixed(0)} USDT/mo).`
      : ` Catalog ${catalogAfter}/${maxImports} import slots used.`;

  return {
    success: `Imported “${remote.name}” from ${platform} into your store.${priceNote}${quotaNote}`,
    productId: product.id,
    oneClick,
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
