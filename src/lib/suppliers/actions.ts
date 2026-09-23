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
} from "@/lib/suppliers";
import { ensureCjProductVariants } from "@/lib/suppliers/cj";
import { loadPlatformSupplierContext } from "@/lib/suppliers/platform-credentials";
import { DEFAULT_CJ_SOURCING_REGION } from "@/lib/sourcing/constants";
import {
  toClientCatalogProducts,
  toImportSourcePayload,
  toSlimInventoryRaw,
} from "@/lib/suppliers/catalog-dto";
import {
  MIN_IMPORT_STOCK_QUANTITY,
  MAX_BULK_IMPORT_ITEMS,
  ONE_CLICK_IMPORT_MARKUP,
  meetsMinImportStock,
  productMatchesSourcingRegion,
  slugifyExternalName,
  supplierPlatformLabel,
  warehouseCountryToRegionCodes,
  type BulkExternalImportItem,
  type BulkExternalImportResult,
} from "@/lib/suppliers/types";
import { createClient } from "@/lib/supabase/server";
import { getVendorForOwner, isVendorKycApproved } from "@/lib/vendors/queries";

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

function isSchemaCacheColumnError(
  message: string | undefined,
  column: string,
) {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes(column.toLowerCase()) &&
    (m.includes("schema cache") ||
      m.includes("does not exist") ||
      m.includes("could not find"))
  );
}

/** Columns that may be missing on partial DBs; omit and retry when PostgREST rejects them. */
const PRODUCT_SCHEMA_FALLBACK_COLUMNS = [
  "compare_at_price",
  "currency",
  "images",
  "specifications",
  "product_type",
  "download_url",
  "download_label",
  "category_id",
  "origin_country_code",
  "origin_region_id",
  "ships_to_region_ids",
  "is_dropship",
  "source_product_id",
  "price_usdt",
  "title",
  "catalog_kind",
  "source_provider_kind",
  "external_product_id",
] as const;

function stripProductSchemaColumn(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any,
  column: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  if (!payload || typeof payload !== "object" || !(column in payload)) {
    return payload;
  }
  const { [column]: _ignored, ...rest } = payload;
  void _ignored;
  return rest;
}

function applyProductSchemaCacheFallback(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any,
  message: string | undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): { payload: any; stripped: boolean } {
  for (const column of PRODUCT_SCHEMA_FALLBACK_COLUMNS) {
    if (
      isSchemaCacheColumnError(message, column) &&
      payload &&
      typeof payload === "object" &&
      column in payload
    ) {
      return {
        payload: stripProductSchemaColumn(payload, column),
        stripped: true,
      };
    }
  }
  return { payload, stripped: false };
}

/** Sanitize a USDT amount for products.price / products.price_usdt inserts. */
function sanitizeUsdtPrice(
  value: number | null | undefined,
  fallback = 0.01,
): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return Math.round(fallback * 100) / 100;
  }
  return Math.round(n * 100) / 100;
}

/**
 * Product write fields for import. Always sets every drifted NOT NULL column
 * the live DB may require (price, price_usdt, title) plus currency.
 */
function productPriceFields(
  sellPrice: number,
  compareAtPriceUsdt: number | null | undefined,
) {
  const price = sanitizeUsdtPrice(sellPrice);
  const fields: {
    price: number;
    price_usdt: number;
    compare_at_price: number | null;
  } = { price, price_usdt: price, compare_at_price: null };
  if (
    compareAtPriceUsdt != null &&
    Number.isFinite(compareAtPriceUsdt) &&
    compareAtPriceUsdt > price
  ) {
    fields.compare_at_price = sanitizeUsdtPrice(compareAtPriceUsdt, price);
  }
  return fields;
}

/**
 * Prefer an explicit compare-at from the preview form; otherwise fall back to
 * the supplier catalog value when it is above the sell price.
 * Pass disable_compare_at=1 (or show_compare_at=0) to omit compare-at entirely —
 * useful for new listings that should not show a strikethrough price.
 */
function resolveImportCompareAtPrice(
  formData: FormData,
  sellPrice: number,
  remoteCompareAt: number | null | undefined,
): number | null {
  const disableRaw = String(formData.get("disable_compare_at") ?? "").trim();
  const showRaw = String(formData.get("show_compare_at") ?? "").trim();
  const compareDisabled =
    disableRaw === "1" ||
    disableRaw.toLowerCase() === "true" ||
    showRaw === "0" ||
    showRaw.toLowerCase() === "false";
  if (compareDisabled) {
    return null;
  }

  const raw = String(
    formData.get("compare_at_price") ?? formData.get("compare_price") ?? "",
  ).trim();

  if (raw !== "") {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }
    const compare = sanitizeUsdtPrice(parsed);
    return compare > sellPrice ? compare : null;
  }

  if (
    remoteCompareAt != null &&
    Number.isFinite(remoteCompareAt) &&
    remoteCompareAt > sellPrice
  ) {
    return sanitizeUsdtPrice(remoteCompareAt);
  }

  return null;
}

/** Non-null listing fields shared by import insert + update payloads. */
function importProductCoreFields(args: {
  name: string;
  description: string;
  sellPrice: number;
  compareAtPriceUsdt: number | null | undefined;
  images: string[];
  stockQuantity: number;
  sku: string | null;
}) {
  const name = args.name.trim() || "Untitled product";
  const description =
    args.description.trim() ||
    `${name} imported from supplier.`;
  return {
    name,
    // Drifted DBs: title NOT NULL — mirror canonical name.
    title: name,
    description,
    ...productPriceFields(args.sellPrice, args.compareAtPriceUsdt),
    currency: "USDT",
    sku: args.sku,
    stock_quantity: Math.max(0, Math.floor(args.stockQuantity)),
    images: Array.isArray(args.images) ? args.images : [],
  };
}

/** Upsert the dedicated CJ import registry (separate from manual catalog). */
async function upsertCjImportedProductRegistry(args: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  vendorId: string;
  productId: string;
  providerId: string | null | undefined;
  remote: ExternalCatalogProduct;
  externalVariantId: string | null;
  externalSku: string | null;
  supplierCostUsdt: number;
}) {
  if (args.remote.providerKind !== "cj_dropshipping") return;
  const { error } = await args.supabase.from("cj_imported_products").upsert(
    {
      vendor_id: args.vendorId,
      product_id: args.productId,
      provider_id: args.providerId ?? null,
      external_product_id: args.remote.externalProductId,
      external_variant_id: args.externalVariantId,
      external_sku: args.externalSku,
      supplier_cost_usdt: sanitizeUsdtPrice(args.supplierCostUsdt),
      source_payload: toImportSourcePayload(args.remote),
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "product_id" },
  );
  // Older DBs may not have the table yet — ignore schema-cache misses.
  if (
    error &&
    !/schema cache|does not exist|could not find/i.test(error.message ?? "")
  ) {
    console.warn("cj_imported_products upsert:", error.message);
  }
}

function resolveImportSellPrice(
  formData: FormData,
  supplierCostUsdt: number,
): { price: number; oneClick: boolean } | { error: string } {
  const oneClickFlag =
    String(formData.get("one_click") ?? "").trim() === "1" ||
    String(formData.get("one_click") ?? "").trim() === "true";
  const rawPrice = String(
    formData.get("price") ?? formData.get("price_usdt") ?? "",
  ).trim();
  const parsed = rawPrice === "" ? NaN : Number(rawPrice);
  const safeCost = sanitizeUsdtPrice(supplierCostUsdt);

  // Explicit sell price from preview / custom-price forms wins over one-click markup.
  if (Number.isFinite(parsed) && parsed > 0) {
    return {
      price: sanitizeUsdtPrice(parsed),
      oneClick: oneClickFlag && rawPrice === "",
    };
  }

  if (rawPrice !== "") {
    return { error: "Enter a sell price greater than zero." };
  }

  if (oneClickFlag) {
    const price = sanitizeUsdtPrice(safeCost * ONE_CLICK_IMPORT_MARKUP, safeCost);
    return { price, oneClick: true };
  }

  // Last resort: use supplier cost so NOT NULL price_usdt/price never receive null.
  if (safeCost > 0) {
    return { price: safeCost, oneClick: false };
  }

  return { error: "Enter a sell price greater than zero." };
}

function resolveImportListingCopy(
  formData: FormData,
  remote: ExternalCatalogProduct,
): { name: string; description: string } {
  const nameOverride = String(
    formData.get("name") ?? formData.get("title") ?? "",
  ).trim();
  const descriptionOverride = String(formData.get("description") ?? "").trim();

  // Never insert a null/empty product title — prefer override, then CJ mapping,
  // then a deterministic fallback from the external product id.
  const rawName = nameOverride || remote.name?.trim() || "";
  const sanitizedName =
    rawName &&
    rawName.toLowerCase() !== "null" &&
    rawName.toLowerCase() !== "undefined"
      ? rawName
      : remote.externalProductId
        ? `${supplierPlatformLabel(remote.providerKind)} product ${remote.externalProductId}`
        : `${supplierPlatformLabel(remote.providerKind)} product`;

  const description =
    descriptionOverride ||
    remote.description?.trim() ||
    `${sanitizedName} imported from ${supplierPlatformLabel(remote.providerKind)}.`;

  return {
    name: sanitizedName.slice(0, 180),
    description,
  };
}

function resolveImportVariant(
  formData: FormData,
  remote: ExternalCatalogProduct,
): {
  externalVariantId: string | null;
  externalSku: string | null;
  supplierCostUsdt: number;
  stockQuantity: number | null;
} {
  const variantId = String(formData.get("external_variant_id") ?? "").trim();
  const skuOverride = String(formData.get("external_sku") ?? "").trim();
  const allVariants = remote.variants ?? [];
  const matched = variantId
    ? allVariants.find((v) => v.externalVariantId === variantId)
    : undefined;

  // Product-level stock for bulk variant imports: sum option inventories when
  // present so the listing reflects the whole matrix, not only the default SKU.
  const variantStockSum = allVariants.reduce<number | null>((acc, variant) => {
    if (variant.stockQuantity == null) return acc;
    return (acc ?? 0) + variant.stockQuantity;
  }, null);

  if (matched) {
    return {
      externalVariantId: matched.externalVariantId,
      externalSku: skuOverride || matched.externalSku || remote.externalSku,
      supplierCostUsdt: matched.priceUsdt,
      stockQuantity:
        remote.stockQuantity ??
        variantStockSum ??
        matched.stockQuantity ??
        null,
    };
  }

  const fallback =
    allVariants.find((v) => v.externalVariantId === remote.externalVariantId) ??
    allVariants[0];

  return {
    externalVariantId:
      variantId || fallback?.externalVariantId || remote.externalVariantId,
    externalSku:
      skuOverride || fallback?.externalSku || remote.externalSku,
    supplierCostUsdt: fallback?.priceUsdt ?? remote.priceUsdt,
    stockQuantity:
      remote.stockQuantity ??
      variantStockSum ??
      fallback?.stockQuantity ??
      null,
  };
}

/** True when the bulk matrix (or a single default SKU) clears the import floor. */
function remoteMeetsImportStockFloor(
  remote: ExternalCatalogProduct,
  preferredStock: number | null,
): { ok: true; stock: number | null } | { ok: false; stock: number | null } {
  if (meetsMinImportStock(preferredStock)) {
    return { ok: true, stock: preferredStock };
  }
  if (meetsMinImportStock(remote.stockQuantity)) {
    return { ok: true, stock: remote.stockQuantity };
  }
  for (const variant of remote.variants ?? []) {
    if (meetsMinImportStock(variant.stockQuantity)) {
      return { ok: true, stock: variant.stockQuantity };
    }
  }
  return {
    ok: false,
    stock: preferredStock ?? remote.stockQuantity ?? null,
  };
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

async function requireKycApprovedVendor() {
  const gate = await requireApprovedVendor();
  if ("error" in gate) return gate;
  if (!isVendorKycApproved(gate.vendor)) {
    return {
      error:
        "Complete KYC verification in Store settings before importing or publishing products." as const,
    };
  }
  return gate;
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

/** Platform-owned supplier context (provider id + resolved API credentials). */
async function loadSupplierContext(kind: ExternalSupplierKind) {
  return loadPlatformSupplierContext(kind);
}

export async function searchSupplierCatalogAction(
  kindRaw: string,
  query: string,
): Promise<{ products: ReturnType<typeof toClientCatalogProducts>; error?: string }> {
  const kind = parseSupplierKind(kindRaw);
  if (!kind) return { products: [], error: "Unknown supplier platform." };

  const gate = await requireApprovedVendor();
  if ("error" in gate) return { products: [], error: gate.error };

  const linked = await loadSupplierContext(kind);
  const products = await searchExternalProducts(
    kind,
    query,
    linked?.credentials ?? null,
  );
  return { products: toClientCatalogProducts(products) };
}

export async function importExternalSupplierProductAction(
  _prev: ExternalImportState,
  formData: FormData,
): Promise<ExternalImportState> {
  const gate = await requireKycApprovedVendor();
  if ("error" in gate) return { error: gate.error };

  const kind = parseSupplierKind(String(formData.get("provider_kind") ?? ""));
  const externalProductId = String(
    formData.get("external_product_id") ?? "",
  ).trim();
  const regionCode =
    String(formData.get("region_code") ?? DEFAULT_CJ_SOURCING_REGION).trim() ||
    DEFAULT_CJ_SOURCING_REGION;

  if (!kind || !externalProductId) {
    return { error: "Select a supplier product to import." };
  }

  // Platform-owned API keys (env / platform_supplier_credentials). Vendors
  // do not need their own CJ/DSers/POD credentials for catalog import.
  const linked = await loadSupplierContext(kind);
  let remote =
    (await getExternalProduct(
      kind,
      externalProductId,
      linked?.credentials ?? null,
    )) ?? null;
  if (!remote) {
    return { error: "Could not load that supplier product." };
  }

  // Bulk import: every color/size from CJ stays on this one product listing.
  // The selected variant is only the default fulfillment / cart preference.
  if (kind === "cj_dropshipping") {
    remote = ensureCjProductVariants(remote);
    if (!remote.variants?.length) {
      // Last chance: re-fetch detail in case the first pass raced CJ rate limits.
      const retry =
        (await getExternalProduct(
          kind,
          externalProductId,
          linked?.credentials ?? null,
        )) ?? null;
      if (retry) {
        remote = ensureCjProductVariants(retry);
      }
    }
    if (!remote.variants?.length) {
      return {
        error:
          "CJ did not return color/size variants for this product. Retry import in a moment.",
      };
    }
  }

  const variant = resolveImportVariant(formData, remote);

  let liveImportStock: number | null = null;
  if (kind === "cj_dropshipping") {
    const { assertCjImportVariantInStock } = await import(
      "@/lib/suppliers/cj-live-stock"
    );
    const liveGate = await assertCjImportVariantInStock({
      externalProductId: remote.externalProductId,
      externalVariantId: variant.externalVariantId,
      externalSku: variant.externalSku,
      productName: remote.name,
      credentials: linked?.credentials ?? null,
    });
    if (!liveGate.ok) {
      // Default SKU may be depleted while other options still have stock —
      // allow bulk import when any option clears the floor.
      const anyInStock = (remote.variants ?? []).some((option) =>
        meetsMinImportStock(option.stockQuantity),
      );
      if (!anyInStock && !meetsMinImportStock(remote.stockQuantity)) {
        return { error: liveGate.error };
      }
    } else if (liveGate.usedLive) {
      liveImportStock = liveGate.liveStock;
    }
  }

  const floor = remoteMeetsImportStockFloor(
    remote,
    liveImportStock != null ? liveImportStock : variant.stockQuantity,
  );
  if (!floor.ok) {
    return {
      error: `Supplier stock must be at least ${MIN_IMPORT_STOCK_QUANTITY} units before import (found ${
        floor.stock == null ? "unknown" : floor.stock
      }).`,
    };
  }
  const effectiveStock = floor.stock;

  if (
    regionCode &&
    regionCode !== "GLOBAL" &&
    !productMatchesSourcingRegion(remote, regionCode)
  ) {
    return {
      error: `This ${supplierPlatformLabel(kind)} product (warehouse ${remote.warehouseCountry}) does not ship to region ${regionCode}. Pick another region or product.`,
    };
  }

  const listing = resolveImportListingCopy(formData, remote);
  const priced = resolveImportSellPrice(formData, variant.supplierCostUsdt);
  if ("error" in priced) {
    return { error: priced.error };
  }
  const { price: sellPrice, oneClick } = priced;
  const minCost = sanitizeUsdtPrice(variant.supplierCostUsdt);
  const compareAtPriceUsdt = resolveImportCompareAtPrice(
    formData,
    sellPrice,
    remote.compareAtPriceUsdt,
  );

  if (sellPrice + 1e-9 < minCost) {
    return {
      error: `Sell price must be at least supplier cost (${minCost} USDT).`,
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- drifted title/price_usdt
      const updatePayload: any = {
        ...importProductCoreFields({
          name: listing.name,
          description: listing.description,
          sellPrice,
          compareAtPriceUsdt,
          images: productImages,
          stockQuantity: effectiveStock ?? 0,
          sku: variant.externalSku,
        }),
        catalog_kind: kind === "cj_dropshipping" ? "cj_import" : "manual",
        is_dropship: true,
        source_provider_kind: kind === "cj_dropshipping" ? "cj_dropshipping" : null,
        external_product_id: remote.externalProductId,
        updated_at: new Date().toISOString(),
      };
      let { error: updateError } = await supabase
        .from("products")
        .update(updatePayload)
        .eq("id", existingImport.product_id)
        .eq("vendor_id", gate.vendor.id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let fallbackPayload: any = updatePayload;

      for (
        let attempt = 0;
        attempt < PRODUCT_SCHEMA_FALLBACK_COLUMNS.length;
        attempt += 1
      ) {
        if (!updateError) break;
        const next = applyProductSchemaCacheFallback(
          fallbackPayload,
          updateError.message,
        );
        if (!next.stripped) break;
        fallbackPayload = next.payload;
        ({ error: updateError } = await supabase
          .from("products")
          .update(fallbackPayload)
          .eq("id", existingImport.product_id)
          .eq("vendor_id", gate.vendor.id));
      }

      if (updateError) {
        return { error: updateError.message };
      }

      await supabase
        .from("external_product_imports")
        .update({
          external_variant_id: variant.externalVariantId,
          external_sku: variant.externalSku,
          source_payload: toImportSourcePayload(remote),
          last_synced_at: new Date().toISOString(),
        })
        .eq("id", existingImport.id);

      await upsertCjImportedProductRegistry({
        supabase,
        vendorId: gate.vendor.id,
        productId: existingImport.product_id,
        providerId: linked?.providerId,
        remote,
        externalVariantId: variant.externalVariantId,
        externalSku: variant.externalSku,
        supplierCostUsdt: minCost,
      });

      revalidatePath("/vendor/products");
      revalidatePath("/vendor/dropship/imported");
      revalidatePath("/vendor/import");
      revalidatePath("/vendor/integrations");
      revalidatePath(`/vendor/sourcing/${existingImport.product_id}`);

      return {
        success: `Updated imported “${listing.name}” from ${
          supplierPlatformLabel(kind)
        }.`,
        productId: existingImport.product_id,
        oneClick,
      };
    }
  } else if (variant.externalSku) {
    // Fallback dedupe when import-tracking tables are not migrated yet.
    const { data: existingBySku } = await supabase
      .from("products")
      .select("id")
      .eq("vendor_id", gate.vendor.id)
      .eq("sku", variant.externalSku)
      .maybeSingle();

    if (existingBySku?.id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- drifted title/price_usdt
      const updatePayload: any = {
        ...importProductCoreFields({
          name: listing.name,
          description: listing.description,
          sellPrice,
          compareAtPriceUsdt,
          images: productImages,
          stockQuantity: effectiveStock ?? 0,
          sku: variant.externalSku,
        }),
        catalog_kind: kind === "cj_dropshipping" ? "cj_import" : "manual",
        is_dropship: true,
        source_provider_kind: kind === "cj_dropshipping" ? "cj_dropshipping" : null,
        external_product_id: remote.externalProductId,
        updated_at: new Date().toISOString(),
      };
      let { error: updateError } = await supabase
        .from("products")
        .update(updatePayload)
        .eq("id", existingBySku.id)
        .eq("vendor_id", gate.vendor.id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let fallbackPayload: any = updatePayload;

      for (
        let attempt = 0;
        attempt < PRODUCT_SCHEMA_FALLBACK_COLUMNS.length;
        attempt += 1
      ) {
        if (!updateError) break;
        const next = applyProductSchemaCacheFallback(
          fallbackPayload,
          updateError.message,
        );
        if (!next.stripped) break;
        fallbackPayload = next.payload;
        ({ error: updateError } = await supabase
          .from("products")
          .update(fallbackPayload)
          .eq("id", existingBySku.id)
          .eq("vendor_id", gate.vendor.id));
      }

      if (updateError) {
        return { error: updateError.message };
      }

      await upsertCjImportedProductRegistry({
        supabase,
        vendorId: gate.vendor.id,
        productId: existingBySku.id,
        providerId: linked?.providerId,
        remote,
        externalVariantId: variant.externalVariantId,
        externalSku: variant.externalSku,
        supplierCostUsdt: minCost,
      });

      revalidatePath("/vendor/products");
      revalidatePath("/vendor/dropship/imported");
      revalidatePath("/vendor/integrations");

      return {
        success: `Updated imported “${listing.name}” from ${
          supplierPlatformLabel(kind)
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

  // When quota RPCs are unavailable, enforce a local CJ-import catalog cap.
  // Manual / custom-sourced products never consume CJ import quota.
  if (!quotaSnapshot) {
    const { count } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("vendor_id", gate.vendor.id)
      .eq("catalog_kind", "cj_import")
      .neq("status", "archived");
    if ((count ?? 0) >= maxImports) {
      return {
        error: `CJ import limit reached (${count}/${maxImports}). Archive CJ listings or upgrade your plan. Manual products are unlimited.`,
      };
    }
  }

  const slugBase = slugifyExternalName(
    `${kind}-${listing.name}`,
  );
  const slug = `${slugBase}-${Date.now().toString(36).slice(-5)}`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- drifted title/price_usdt
  const insertPayload: any = {
    vendor_id: gate.vendor.id,
    slug,
    ...importProductCoreFields({
      name: listing.name,
      description: listing.description,
      sellPrice,
      compareAtPriceUsdt,
      images: productImages,
      stockQuantity: effectiveStock ?? 0,
      sku: variant.externalSku,
    }),
    status: "active" as const,
    product_type: "physical" as const,
    is_dropship: true,
    catalog_kind: kind === "cj_dropshipping" ? "cj_import" : "manual",
    source_provider_kind: kind === "cj_dropshipping" ? "cj_dropshipping" : null,
    external_product_id: remote.externalProductId,
  };

  let { data: product, error: productError } = await supabase
    .from("products")
    .insert(insertPayload)
    .select("id")
    .single();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fallbackPayload: any = insertPayload;

  for (
    let attempt = 0;
    attempt < PRODUCT_SCHEMA_FALLBACK_COLUMNS.length;
    attempt += 1
  ) {
    if (!productError) break;
    const next = applyProductSchemaCacheFallback(
      fallbackPayload,
      productError.message,
    );
    if (!next.stripped) break;
    fallbackPayload = next.payload;
    ({ data: product, error: productError } = await supabase
      .from("products")
      .insert(fallbackPayload)
      .select("id")
      .single());
  }

  if (productError || !product) {
    return { error: productError?.message ?? "Failed to create product." };
  }

  if (linked?.providerId) {
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
            variant.externalVariantId ||
            variant.externalSku ||
            remote.externalProductId,
          warehouse_country: remote.warehouseCountry || "CN",
          shipping_days_min: remote.shippingDaysMin,
          shipping_days_max: remote.shippingDaysMax,
          shipping_cost_usdt: 0,
          priority: 1,
          is_active: true,
        },
        { onConflict: "product_id,region_id,provider_id" },
      );

      // Apply storefront regional filtering on the imported listing.
      await supabase
        .from("products")
        .update({
          origin_region_id: regionId,
          ships_to_region_ids: [regionId],
          updated_at: new Date().toISOString(),
        })
        .eq("id", product.id)
        .eq("vendor_id", gate.vendor.id);
    }

    const { error: importUpsertError } = await supabase
      .from("external_product_imports")
      .upsert(
        {
          vendor_id: gate.vendor.id,
          provider_id: linked.providerId,
          product_id: product.id,
          external_product_id: remote.externalProductId,
          external_variant_id: variant.externalVariantId,
          external_sku: variant.externalSku,
          source_payload: toImportSourcePayload(remote),
          last_synced_at: new Date().toISOString(),
        },
        { onConflict: "vendor_id,provider_id,external_product_id" },
      );
    if (importUpsertError && !isMissingSchemaError(importUpsertError.message)) {
      return {
        error: `Product created but import tracking failed: ${importUpsertError.message}`,
        productId: product.id,
      };
    }
  }

  await upsertCjImportedProductRegistry({
    supabase,
    vendorId: gate.vendor.id,
    productId: product.id,
    providerId: linked?.providerId,
    remote,
    externalVariantId: variant.externalVariantId,
    externalSku: variant.externalSku,
    supplierCostUsdt: minCost,
  });

  revalidatePath("/vendor/products");
  revalidatePath("/vendor/dropship/imported");
  revalidatePath("/vendor/import");
  revalidatePath("/vendor/integrations");
  revalidatePath("/vendor/sourcing");
  revalidatePath(`/vendor/sourcing/${product.id}`);

  const activeAfter = activeBefore + 1;
  const catalogAfter = catalogBefore + 1;
  const platform = supplierPlatformLabel(kind);
  const variantCount = remote.variants?.length ?? 0;
  const variantNote =
    kind === "cj_dropshipping" && variantCount > 0
      ? ` Imported ${variantCount} color/size options under one listing.`
      : "";
  const priceNote = oneClick
    ? ` Listed at ${sellPrice.toFixed(2)} USDT (${Math.round((ONE_CLICK_IMPORT_MARKUP - 1) * 100)}% markup).`
    : ` Listed at ${sellPrice.toFixed(2)} USDT after preview review.`;
  const isCjImport = kind === "cj_dropshipping";
  const quotaNote = isCjImport
    ? activeAfter < minActive
      ? ` Active CJ catalog ${activeAfter}/${minActive} toward the ${minActive}-item CJ fee floor (${(minActive * itemFee).toFixed(0)} USDT/mo). Manual/custom products are exempt.`
      : ` CJ catalog ${catalogAfter}/${maxImports} import slots used. Manual/custom products do not count.`
    : ` Manual/custom listings are not subject to CJ import fees or fee floors.`;

  return {
    success: `Imported “${listing.name}” from ${platform} into your store.${variantNote}${priceNote}${quotaNote}`,
    productId: product.id,
    oneClick,
  };
}

/**
 * One-click bulk import: import multiple supplier catalog rows under separate
 * listings (each with its full color/size matrix when CJ). Compare-at is off
 * by default so new listings do not show a strikethrough price.
 */
export async function bulkImportExternalSupplierProductsAction(args: {
  items: BulkExternalImportItem[];
  regionCode?: string;
  /** When true, keep supplier compare-at / suggested strikethrough prices. */
  includeComparePrice?: boolean;
}): Promise<BulkExternalImportResult> {
  const empty: BulkExternalImportResult = {
    imported: 0,
    failed: [],
    productIds: [],
  };

  const gate = await requireKycApprovedVendor();
  if ("error" in gate) {
    return { ...empty, error: gate.error };
  }

  const regionCode =
    (args.regionCode ?? DEFAULT_CJ_SOURCING_REGION).trim() ||
    DEFAULT_CJ_SOURCING_REGION;

  const seen = new Set<string>();
  const items: BulkExternalImportItem[] = [];
  for (const raw of args.items ?? []) {
    const providerKind = String(raw.providerKind ?? "").trim();
    const externalProductId = String(raw.externalProductId ?? "").trim();
    if (!providerKind || !externalProductId) continue;
    const key = `${providerKind}:${externalProductId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ providerKind, externalProductId });
    if (items.length >= MAX_BULK_IMPORT_ITEMS) break;
  }

  if (items.length === 0) {
    return { ...empty, error: "Select at least one supplier product to import." };
  }

  const includeCompare = Boolean(args.includeComparePrice);
  const failed: BulkExternalImportResult["failed"] = [];
  const productIds: string[] = [];

  for (const item of items) {
    const formData = new FormData();
    formData.set("provider_kind", item.providerKind);
    formData.set("external_product_id", item.externalProductId);
    formData.set("region_code", regionCode);
    formData.set("one_click", "1");
    if (!includeCompare) {
      formData.set("disable_compare_at", "1");
    }

    const result = await importExternalSupplierProductAction(null, formData);
    if (result?.error) {
      failed.push({
        externalProductId: item.externalProductId,
        error: result.error,
      });
      // Stop early when the catalog cap is hit — remaining items will also fail.
      if (/import limit|catalog cap|quota/i.test(result.error)) {
        break;
      }
      continue;
    }
    if (result?.productId) {
      productIds.push(result.productId);
    }
  }

  const imported = productIds.length;
  if (imported === 0) {
    return {
      ...empty,
      failed,
      error:
        failed[0]?.error ??
        "Bulk import failed. Check stock minimums and try again.",
    };
  }

  const success =
    failed.length === 0
      ? `Imported ${imported} product${imported === 1 ? "" : "s"} into your store.`
      : `Imported ${imported} of ${items.length} products. ${failed.length} failed.`;

  return { success, imported, failed, productIds };
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
    return { error: "This product was not imported from an external supplier catalog." };
  }

  const { data: provider } = await supabase
    .from("supplier_providers")
    .select("kind")
    .eq("id", imported.provider_id)
    .maybeSingle();

  const kind = parseSupplierKind(provider?.kind);
  if (!kind) return { error: "Unknown supplier kind." };

  const linked = await loadSupplierContext(kind);
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
      source_payload: toSlimInventoryRaw(snapshot),
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
