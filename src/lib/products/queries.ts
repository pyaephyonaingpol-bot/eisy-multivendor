import { createClient } from "@/lib/supabase/server";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { normalizeProductSpecifications } from "@/lib/products/specifications";
import type { Product, Vendor } from "@/lib/types/database";

function normalizeProduct(row: Product): Product {
  return {
    ...row,
    images: Array.isArray(row.images) ? row.images : [],
    specifications: normalizeProductSpecifications(
      (row as Product & { specifications?: unknown }).specifications,
    ),
    product_type: row.product_type ?? "physical",
  };
}

export type PublicProductDetail = Product & {
  vendor: Pick<Vendor, "id" | "name" | "slug" | "status"> | null;
};

export async function listProductsForVendor(vendorId: string): Promise<Product[]> {
  if (!getSupabasePublicEnv()) {
    return [];
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("*")
    .eq("vendor_id", vendorId)
    .order("created_at", { ascending: false });

  return ((data as Product[] | null) ?? []).map(normalizeProduct);
}

export async function getVendorProductById(
  vendorId: string,
  productId: string,
): Promise<Product | null> {
  if (!getSupabasePublicEnv()) {
    return null;
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("*")
    .eq("vendor_id", vendorId)
    .eq("id", productId)
    .maybeSingle();

  return data ? normalizeProduct(data as Product) : null;
}

export async function getPublicProductById(
  productId: string,
): Promise<PublicProductDetail | null> {
  if (!getSupabasePublicEnv()) {
    return null;
  }

  const supabase = await createClient();
  const { data: productRow } = await supabase
    .from("products")
    .select("*")
    .eq("id", productId)
    .eq("status", "active")
    .maybeSingle();

  if (!productRow) {
    return null;
  }

  const product = normalizeProduct(productRow as Product);

  const { data: vendorRow } = await supabase
    .from("vendors")
    .select("id, name, slug, status")
    .eq("id", product.vendor_id)
    .maybeSingle();

  return {
    ...product,
    vendor: (vendorRow as Pick<Vendor, "id" | "name" | "slug" | "status"> | null) ?? null,
  };
}
