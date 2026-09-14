"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ProductStatus } from "@/lib/types/database";
import { getVendorForOwner } from "@/lib/vendors/queries";
import { slugifyStoreName } from "@/lib/vendors/slug";

export type ProductActionState = {
  error?: string;
  success?: string;
} | null;

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

export async function createProduct(
  _prev: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const slugInput = String(formData.get("slug") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const sku = String(formData.get("sku") ?? "").trim();
  const currency =
    String(formData.get("currency") ?? "USD").trim().toUpperCase() || "USD";
  const slug = slugifyStoreName(slugInput || name);
  const price = parseMoney(formData.get("price"));
  const compareAtPrice = parseMoney(formData.get("compare_at_price"));
  const stockQuantity = parseStock(formData.get("stock_quantity"));
  const status = parseStatus(formData.get("status"));

  if (!name) {
    return { error: "Product name is required." };
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

  if (Number.isNaN(stockQuantity)) {
    return { error: "Stock must be a whole number of 0 or greater." };
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

  const { error } = await supabase.from("products").insert({
    vendor_id: vendor.id,
    name,
    slug,
    description: description || null,
    price,
    compare_at_price: compareAtPrice,
    currency,
    sku: sku || null,
    stock_quantity: stockQuantity,
    status,
    images: [],
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "That product slug is already used in your catalog." };
    }
    return { error: error.message };
  }

  revalidatePath("/vendor/products");
  revalidatePath("/vendor/dashboard");
  revalidatePath("/products");
  redirect("/vendor/products");
}
