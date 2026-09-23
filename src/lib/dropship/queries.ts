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

export type ImportableCatalogProduct = Product & {
  vendor: Pick<Vendor, "id" | "name" | "slug" | "status">;
  available_stock: number;
};

/**
 * Active **independent / marketplace** vendor products another store may
 * resell (separate from CJ Dropshipping bulk import).
 * Excludes the caller's own products, dropship copies, and CJ-imported listings.
 */
export async function listImportableCatalogProducts(
  excludeVendorId?: string | null,
  limit = 48,
): Promise<ImportableCatalogProduct[]> {
  if (!getSupabasePublicEnv()) {
    return [];
  }

  const supabase = await createClient();

  // Prefer independent/manual catalog only — never surface CJ imports here.
  const withCatalogKind = await supabase
    .from("products")
    .select("*")
    .eq("status", "active")
    .eq("is_dropship", false)
    .neq("catalog_kind", "cj_import")
    .order("created_at", { ascending: false })
    .limit(Math.max(limit * 3, 48));
  let productRows = withCatalogKind.data;
  if (
    withCatalogKind.error &&
    /catalog_kind|schema cache|does not exist|could not find/i.test(
      withCatalogKind.error.message ?? "",
    )
  ) {
    const fallback = await supabase
      .from("products")
      .select("*")
      .eq("status", "active")
      .eq("is_dropship", false)
      .order("created_at", { ascending: false })
      .limit(Math.max(limit * 3, 48));
    productRows = fallback.data;
  }

  const products = ((productRows as Product[] | null) ?? [])
    .map(normalizeProduct)
    .filter((product) => {
      if (excludeVendorId && product.vendor_id === excludeVendorId) {
        return false;
      }
      // Defense in depth when catalog_kind filter was unavailable.
      if (product.catalog_kind === "cj_import") return false;
      return true;
    });

  if (products.length === 0) {
    return [];
  }

  const vendorIds = [...new Set(products.map((product) => product.vendor_id))];
  const { data: vendorRows } = await supabase
    .from("vendors")
    .select("id, name, slug, status")
    .in("id", vendorIds)
    .eq("status", "approved");

  const vendorsById = new Map(
    ((vendorRows as Pick<Vendor, "id" | "name" | "slug" | "status">[] | null) ?? []).map(
      (vendor) => [vendor.id, vendor],
    ),
  );

  return products
    .map((product) => {
      const vendor = vendorsById.get(product.vendor_id);
      if (!vendor) {
        return null;
      }
      return {
        ...product,
        vendor,
        available_stock:
          product.product_type === "digital"
            ? Number.POSITIVE_INFINITY
            : product.stock_quantity,
      };
    })
    .filter((row): row is ImportableCatalogProduct => row != null)
    .slice(0, limit);
}

export async function getExistingDropshipListing(
  vendorId: string,
  sourceProductId: string,
): Promise<Product | null> {
  if (!getSupabasePublicEnv()) {
    return null;
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("*")
    .eq("vendor_id", vendorId)
    .eq("source_product_id", sourceProductId)
    .maybeSingle();

  return data ? normalizeProduct(data as Product) : null;
}
