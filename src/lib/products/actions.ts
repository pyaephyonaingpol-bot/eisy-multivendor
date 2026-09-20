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

function isCompareAtPriceSchemaError(message: string | undefined) {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("compare_at_price") &&
    (m.includes("schema cache") ||
      m.includes("does not exist") ||
      m.includes("could not find"))
  );
}

function stripCompareAtPrice<T extends Record<string, unknown>>(payload: T) {
  const { compare_at_price: _ignored, ...rest } = payload;
  void _ignored;
  return rest as Omit<T, "compare_at_price">;
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

  const insertPayload = {
    vendor_id: vendor.id,
    category_id: parsed.categoryId,
    name: parsed.name,
    slug: parsed.slug,
    description: parsed.description || null,
    price: parsed.price,
    compare_at_price: parsed.compareAtPrice,
    currency: parsed.currency,
    sku: parsed.sku || null,
    stock_quantity: parsed.stockQuantity,
    status: parsed.status,
    images: imageResult.images,
    specifications: parsed.specifications,
    product_type: parsed.productType,
    download_url: parsed.productType === "digital" ? parsed.downloadUrl : null,
    download_label:
      parsed.productType === "digital" ? parsed.downloadLabel || null : null,
    origin_country_code: parsed.originCountryCode,
    origin_region_id: parsed.originRegionId,
    ships_to_region_ids: parsed.shipsToRegionIds,
  };

  let { error } = await supabase.from("products").insert(insertPayload);

  if (error && isCompareAtPriceSchemaError(error.message)) {
    ({ error } = await supabase
      .from("products")
      .insert(stripCompareAtPrice(insertPayload)));
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

  const imageResult = await resolveProductImages(vendor.id, formData);
  if (imageResult.error) {
    return { error: imageResult.error };
  }

  const updatePayload = {
    category_id: parsed.categoryId,
    name: parsed.name,
    slug: parsed.slug,
    description: parsed.description || null,
    price: parsed.price,
    compare_at_price: parsed.compareAtPrice,
    currency: parsed.currency,
    sku: parsed.sku || null,
    stock_quantity: parsed.stockQuantity,
    status: parsed.status,
    images: imageResult.images,
    specifications: parsed.specifications,
    product_type: parsed.productType,
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

  if (error && isCompareAtPriceSchemaError(error.message)) {
    ({ error } = await supabase
      .from("products")
      .update(stripCompareAtPrice(updatePayload))
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
