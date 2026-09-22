"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { MARKETPLACE_CURRENCY } from "@/lib/money";
import { resolveProductImages } from "@/lib/products/images";
import { parseProductSpecificationsFromFormData } from "@/lib/products/specifications";
import { createClient } from "@/lib/supabase/server";
import type { ProductStatus, ProductType } from "@/lib/types/database";
import { getVendorForOwner, isVendorKycApproved } from "@/lib/vendors/queries";
import { slugifyStoreName } from "@/lib/vendors/slug";

export type ProductActionState = {
  error?: string;
  success?: string;
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

function parseMoney(value: FormDataEntryValue | null): number | null {
  if (value == null || String(value).trim() === "") {
    return null;
  }
  const amount = Number(String(value).trim());
  if (!Number.isFinite(amount) || amount < 0) {
    return NaN;
  }
  return Math.round(amount * 100) / 100;
}

function parseStock(value: FormDataEntryValue | null): number {
  if (value == null || String(value).trim() === "") {
    return 0;
  }
  const stock = Number.parseInt(String(value).trim(), 10);
  if (!Number.isFinite(stock) || stock < 0) {
    return NaN;
  }
  return stock;
}

function parseStatus(value: FormDataEntryValue | null): ProductStatus {
  return value === "active" || value === "archived" ? value : "draft";
}

function parseProductType(value: FormDataEntryValue | null): ProductType {
  return value === "digital" ? "digital" : "physical";
}

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

type ParsedProductFields =
  | { error: string }
  | {
      name: string;
      slug: string;
      description: string;
      sku: string;
      currency: string;
      price: number;
      compareAtPrice: number | null;
      productType: ProductType;
      stockQuantity: number;
      downloadUrl: string;
      downloadLabel: string;
      status: ProductStatus;
      categoryId: string;
      originCountryCode: string | null;
      originRegionId: string | null;
      shipsToRegionIds: string[];
      specifications: { key: string; value: string }[];
    };

function parseProductFields(formData: FormData): ParsedProductFields {
  const name = String(formData.get("name") ?? "").trim();
  const slugInput = String(formData.get("slug") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const sku = String(formData.get("sku") ?? "").trim();
  // Marketplace settlement is USDT-only (Eisy Myanmar policy).
  const currency = MARKETPLACE_CURRENCY;
  const slug = slugifyStoreName(slugInput || name);
  const price = parseMoney(formData.get("price"));
  const compareAtPrice = parseMoney(formData.get("compare_at_price"));
  const productType = parseProductType(formData.get("product_type"));
  const stockQuantity =
    productType === "physical" ? parseStock(formData.get("stock_quantity")) : 0;
  const downloadUrl = String(formData.get("download_url") ?? "").trim();
  const downloadLabel = String(formData.get("download_label") ?? "").trim();
  const status = parseStatus(formData.get("status"));
  const categoryId = String(formData.get("category_id") ?? "").trim();
  const originCountryCode = String(formData.get("origin_country_code") ?? "")
    .trim()
    .toUpperCase()
    .slice(0, 2);
  const originRegionId = String(formData.get("origin_region_id") ?? "").trim();
  const shipsToRegionIds = formData
    .getAll("ships_to_region_ids")
    .map((value) => String(value).trim())
    .filter(Boolean);
  const specsResult = parseProductSpecificationsFromFormData(formData);

  if (!name) {
    return { error: "Product name is required." };
  }

  if (!categoryId) {
    return { error: "Select a category." };
  }

  if (!slug) {
    return { error: "Product URL slug is required." };
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return { error: "Slug must use lowercase letters, numbers, and hyphens." };
  }

  if (price == null || Number.isNaN(price)) {
    return { error: "Enter a valid price (0 or greater)." };
  }

  if (compareAtPrice != null && Number.isNaN(compareAtPrice)) {
    return { error: "Enter a valid compare-at price, or leave it blank." };
  }

  if (productType === "physical" && Number.isNaN(stockQuantity)) {
    return { error: "Stock must be a whole number of 0 or greater." };
  }

  if (productType === "digital") {
    if (!downloadUrl) {
      return { error: "Digital products need a download link or file URL." };
    }
    if (!isValidHttpUrl(downloadUrl)) {
      return { error: "Download link must be a valid http(s) URL." };
    }
  }

  if (
    originCountryCode &&
    !/^[A-Z]{2}$/.test(originCountryCode)
  ) {
    return { error: "Origin country must be a 2-letter code (e.g. MM)." };
  }

  if (specsResult.error) {
    return { error: specsResult.error };
  }

  return {
    name,
    slug,
    description,
    sku,
    currency,
    price,
    compareAtPrice,
    productType,
    stockQuantity,
    downloadUrl,
    downloadLabel,
    status,
    categoryId,
    originCountryCode: originCountryCode || null,
    originRegionId: originRegionId || null,
    shipsToRegionIds,
    specifications: specsResult.specifications,
  };
}

function revalidateProductPaths(productId?: string) {
  revalidatePath("/vendor/products");
  revalidatePath("/vendor/dashboard");
  revalidatePath("/products");
  if (productId) {
    revalidatePath(`/vendor/products/${productId}/edit`);
    revalidatePath(`/products/${productId}`);
  }
}

export async function createProduct(
  _prev: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const parsed = parseProductFields(formData);
  if ("error" in parsed) {
    return { error: parsed.error };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to add a product." };
  }

  const vendor = await getVendorForOwner(user.id);

  if (!vendor) {
    return { error: "Submit a vendor application before adding products." };
  }

  if (parsed.status === "active" && !isVendorKycApproved(vendor)) {
    return {
      error:
        "Complete KYC verification in Store settings before publishing products. You can still save drafts.",
    };
  }

  const imageResult = await resolveProductImages(vendor.id, formData);
  if (imageResult.error) {
    return { error: imageResult.error };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- price_usdt is drifted
  const insertPayload: any = {
    vendor_id: vendor.id,
    category_id: parsed.categoryId,
    name: parsed.name,
    slug: parsed.slug,
    description: parsed.description || null,
    price: parsed.price,
    // Drifted DBs require price_usdt NOT NULL; mirror canonical USDT price.
    price_usdt: parsed.price,
    compare_at_price: parsed.compareAtPrice,
    currency: parsed.currency,
    sku: parsed.sku || null,
    stock_quantity: parsed.stockQuantity,
    status: parsed.status,
    images: imageResult.images,
    specifications: parsed.specifications,
    product_type: parsed.productType,
    // Manual vendor catalog — never mark as CJ import.
    catalog_kind: "manual",
    is_dropship: false,
    download_url: parsed.productType === "digital" ? parsed.downloadUrl : null,
    download_label:
      parsed.productType === "digital" ? parsed.downloadLabel || null : null,
    origin_country_code: parsed.originCountryCode,
    origin_region_id: parsed.originRegionId,
    ships_to_region_ids: parsed.shipsToRegionIds,
  };

  let { error } = await supabase.from("products").insert(insertPayload);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fallbackPayload: any = insertPayload;

  for (let attempt = 0; attempt < PRODUCT_SCHEMA_FALLBACK_COLUMNS.length; attempt += 1) {
    if (!error) break;
    const next = applyProductSchemaCacheFallback(fallbackPayload, error.message);
    if (!next.stripped) break;
    fallbackPayload = next.payload;
    ({ error } = await supabase.from("products").insert(fallbackPayload));
  }

  if (error) {
    if (error.code === "23505") {
      return { error: "That product slug is already used in your catalog." };
    }
    return { error: error.message };
  }

  revalidateProductPaths();
  redirect("/vendor/products");
}

export async function updateProduct(
  _prev: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const productId = String(formData.get("product_id") ?? "").trim();
  if (!productId) {
    return { error: "Missing product id." };
  }

  const parsed = parseProductFields(formData);
  if ("error" in parsed) {
    return { error: parsed.error };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to edit a product." };
  }

  const vendor = await getVendorForOwner(user.id);

  if (!vendor) {
    return { error: "Submit a vendor application before editing products." };
  }

  if (parsed.status === "active" && !isVendorKycApproved(vendor)) {
    return {
      error:
        "Complete KYC verification in Store settings before publishing products. You can still save drafts.",
    };
  }

  const { data: existing, error: loadError } = await supabase
    .from("products")
    .select("id")
    .eq("id", productId)
    .eq("vendor_id", vendor.id)
    .maybeSingle();

  if (loadError) {
    return { error: loadError.message };
  }

  if (!existing) {
    return { error: "Product not found in your catalog." };
  }

  // Keep CJ imports in the CJ workflow — never reclassify via the manual form.
  const existingKind =
    (existing as { catalog_kind?: string | null }).catalog_kind === "cj_import"
      ? "cj_import"
      : "manual";

  const imageResult = await resolveProductImages(vendor.id, formData);
  if (imageResult.error) {
    return { error: imageResult.error };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- price_usdt is drifted
  const updatePayload: any = {
    category_id: parsed.categoryId,
    name: parsed.name,
    slug: parsed.slug,
    description: parsed.description || null,
    price: parsed.price,
    // Drifted DBs require price_usdt NOT NULL; mirror canonical USDT price.
    price_usdt: parsed.price,
    compare_at_price: parsed.compareAtPrice,
    currency: parsed.currency,
    sku: parsed.sku || null,
    stock_quantity: parsed.stockQuantity,
    status: parsed.status,
    images: imageResult.images,
    specifications: parsed.specifications,
    product_type: parsed.productType,
    catalog_kind: existingKind,
    download_url: parsed.productType === "digital" ? parsed.downloadUrl : null,
    download_label:
      parsed.productType === "digital" ? parsed.downloadLabel || null : null,
    origin_country_code: parsed.originCountryCode,
    origin_region_id: parsed.originRegionId,
    ships_to_region_ids: parsed.shipsToRegionIds,
  };

  let { error } = await supabase
    .from("products")
    .update(updatePayload)
    .eq("id", productId)
    .eq("vendor_id", vendor.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fallbackPayload: any = updatePayload;

  for (let attempt = 0; attempt < PRODUCT_SCHEMA_FALLBACK_COLUMNS.length; attempt += 1) {
    if (!error) break;
    const next = applyProductSchemaCacheFallback(fallbackPayload, error.message);
    if (!next.stripped) break;
    fallbackPayload = next.payload;
    ({ error } = await supabase
      .from("products")
      .update(fallbackPayload)
      .eq("id", productId)
      .eq("vendor_id", vendor.id));
  }

  if (error) {
    if (error.code === "23505") {
      return { error: "That product slug is already used in your catalog." };
    }
    return { error: error.message };
  }

  revalidateProductPaths(productId);
  redirect("/vendor/products");
}
