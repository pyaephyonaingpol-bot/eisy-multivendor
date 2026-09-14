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
    source_product_id: row.source_product_id ?? null,
    is_dropship: Boolean(row.is_dropship),
  };
}

export type PublicProductDetail = Product & {
  vendor: Pick<Vendor, "id" | "name" | "slug" | "status"> | null;
  /** Supplier stock when this is a dropship listing; otherwise own stock. */
  available_stock: number;
  source_vendor: Pick<Vendor, "id" | "name" | "slug"> | null;
};

export type PublicProductSummary = PublicProductDetail;

async function withPublicVendorMeta(
  products: Product[],
): Promise<PublicProductSummary[]> {
  if (products.length === 0) {
    return [];
  }

  const supabase = await createClient();
  const vendorIds = [...new Set(products.map((product) => product.vendor_id))];
  const sourceIds = [
    ...new Set(
      products
        .filter((product) => product.is_dropship && product.source_product_id)
        .map((product) => product.source_product_id as string),
    ),
  ];

  const [{ data: vendorRows }, sourceResult] = await Promise.all([
    supabase
      .from("vendors")
      .select("id, name, slug, status")
      .in("id", vendorIds)
      .eq("status", "approved"),
    sourceIds.length > 0
      ? supabase
          .from("products")
          .select("id, vendor_id, stock_quantity, product_type, status")
          .in("id", sourceIds)
      : Promise.resolve({ data: [] as Product[] }),
  ]);

  const vendorsById = new Map(
    ((vendorRows as Pick<Vendor, "id" | "name" | "slug" | "status">[] | null) ?? []).map(
      (vendor) => [vendor.id, vendor],
    ),
  );

  const sourceById = new Map(
    ((sourceResult.data as Pick<
      Product,
      "id" | "vendor_id" | "stock_quantity" | "product_type" | "status"
    >[] | null) ?? []).map((row) => [row.id, row]),
  );

  const sourceVendorIds = [
    ...new Set([...sourceById.values()].map((source) => source.vendor_id)),
  ];

  let sourceVendorsById = new Map<string, Pick<Vendor, "id" | "name" | "slug">>();
  if (sourceVendorIds.length > 0) {
    const { data: sourceVendorRows } = await supabase
      .from("vendors")
      .select("id, name, slug")
      .in("id", sourceVendorIds);
    sourceVendorsById = new Map(
      ((sourceVendorRows as Pick<Vendor, "id" | "name" | "slug">[] | null) ?? []).map(
        (vendor) => [vendor.id, vendor],
      ),
    );
  }

  const results: PublicProductSummary[] = [];
  for (const product of products) {
    const vendor = vendorsById.get(product.vendor_id) ?? null;
    if (!vendor) {
      continue;
    }

    let available_stock = product.stock_quantity;
    let source_vendor: Pick<Vendor, "id" | "name" | "slug"> | null = null;

    if (product.is_dropship && product.source_product_id) {
      const source = sourceById.get(product.source_product_id);
      if (!source || source.status !== "active") {
        continue;
      }
      available_stock =
        source.product_type === "digital"
          ? Number.POSITIVE_INFINITY
          : source.stock_quantity;
      source_vendor = sourceVendorsById.get(source.vendor_id) ?? null;
    } else if (product.product_type === "digital") {
      available_stock = Number.POSITIVE_INFINITY;
    }

    results.push({
      ...product,
      vendor,
      available_stock,
      source_vendor,
    });
  }

  return results;
}

export async function listPublicProducts(limit = 24): Promise<PublicProductSummary[]> {
  if (!getSupabasePublicEnv()) {
    return [];
  }

  const supabase = await createClient();
  const { data: productRows } = await supabase
    .from("products")
    .select("*")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(limit);

  const products = ((productRows as Product[] | null) ?? []).map(normalizeProduct);
  return withPublicVendorMeta(products);
}

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

  const [detail] = await withPublicVendorMeta([
    normalizeProduct(productRow as Product),
  ]);
  return detail ?? null;
}
