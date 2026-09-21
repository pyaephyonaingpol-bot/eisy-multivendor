import { unstable_cache } from "next/cache";
import { createAnonClient } from "@/lib/supabase/anon";
import { createClient } from "@/lib/supabase/server";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { normalizeProductSpecifications } from "@/lib/products/specifications";
import { getBuyerSourcingContext } from "@/lib/sourcing/queries";
import type { Product, ProductCatalogKind, Vendor } from "@/lib/types/database";
import { DEFAULT_BUYER_COUNTRY } from "@/lib/sourcing/constants";

function normalizeProduct(row: Product): Product {
  const catalogKind =
    (row as Product & { catalog_kind?: ProductCatalogKind | null }).catalog_kind ===
    "cj_import"
      ? "cj_import"
      : "manual";
  return {
    ...row,
    images: Array.isArray(row.images) ? row.images : [],
    specifications: normalizeProductSpecifications(
      (row as Product & { specifications?: unknown }).specifications,
    ),
    product_type: row.product_type ?? "physical",
    source_product_id: row.source_product_id ?? null,
    is_dropship: Boolean(row.is_dropship) || catalogKind === "cj_import",
    catalog_kind: catalogKind,
    origin_country_code:
      (row as Product & { origin_country_code?: string | null }).origin_country_code ??
      null,
    origin_region_id:
      (row as Product & { origin_region_id?: string | null }).origin_region_id ?? null,
    ships_to_region_ids: Array.isArray(
      (row as Product & { ships_to_region_ids?: string[] }).ships_to_region_ids,
    )
      ? ((row as Product & { ships_to_region_ids?: string[] }).ships_to_region_ids as string[])
      : [],
  };
}

export type PublicProductDetail = Product & {
  vendor: Pick<Vendor, "id" | "name" | "slug" | "status" | "logo_url"> | null;
  /** Supplier stock when this is a dropship listing; otherwise own stock. */
  available_stock: number;
  source_vendor: Pick<Vendor, "id" | "name" | "slug"> | null;
};

export type PublicProductSummary = PublicProductDetail;

async function filterDeliverableProducts(
  products: Product[],
  countryCode: string,
  supabaseClient?: Awaited<ReturnType<typeof createClient>>,
): Promise<Product[]> {
  if (products.length === 0) {
    return [];
  }

  const supabase = supabaseClient ?? (await createClient());
  const safeCountry = countryCode || DEFAULT_BUYER_COUNTRY;
  const { data, error } = await supabase.rpc("filter_deliverable_product_ids", {
    p_product_ids: products.map((product) => product.id),
    p_country_code: safeCountry,
  });

  let regionFiltered = products;
  if (error || !data) {
    // Fail open for local inventory if the migration is not applied yet.
    console.warn("filter_deliverable_product_ids:", error?.message);
  } else {
    const allowed = new Set(data as string[]);
    regionFiltered = products.filter((product) => allowed.has(product.id));
  }

  if (regionFiltered.length === 0) {
    return [];
  }

  // Second pass: live CJ freight — hide CJ imports that cannot ship to this country.
  try {
    const { filterCjProductsShippableToCountry } = await import(
      "@/lib/suppliers/cj-shipping"
    );
    const cjAllowed = await filterCjProductsShippableToCountry(
      regionFiltered.map((product) => product.id),
      safeCountry,
    );
    return regionFiltered.filter((product) => cjAllowed.has(product.id));
  } catch (cjError) {
    console.warn(
      "filterCjProductsShippableToCountry:",
      cjError instanceof Error ? cjError.message : cjError,
    );
    return regionFiltered;
  }
}

async function withPublicVendorMeta(
  products: Product[],
  supabaseClient?: Awaited<ReturnType<typeof createClient>>,
): Promise<PublicProductSummary[]> {
  if (products.length === 0) {
    return [];
  }

  const supabase = supabaseClient ?? (await createClient());
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
      .select("id, name, slug, status, logo_url")
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
    ((vendorRows as Pick<Vendor, "id" | "name" | "slug" | "status" | "logo_url">[] | null) ?? []).map(
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

  const sourcing = await getBuyerSourcingContext();
  return listPublicProductsForCountry(sourcing.countryCode, limit);
}

/** Public catalog filtered to a specific buyer country (vendor ships_to + routes). */
export async function listPublicProductsForCountry(
  countryCode: string,
  limit = 24,
): Promise<PublicProductSummary[]> {
  if (!getSupabasePublicEnv()) {
    return [];
  }

  const safeLimit = Math.min(Math.max(limit, 1), 48);
  const safeCountry = (countryCode || DEFAULT_BUYER_COUNTRY).toUpperCase();

  const cached = unstable_cache(
    async () => {
      const supabase = createAnonClient();
      // Over-fetch so region filtering still fills the requested page size.
      const fetchLimit = Math.min(Math.max(safeLimit * 4, safeLimit), 200);
      const { data: productRows } = await supabase
        .from("products")
        .select("*")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(fetchLimit);

      const products = await filterDeliverableProducts(
        ((productRows as Product[] | null) ?? []).map(normalizeProduct),
        safeCountry,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase as any,
      );
      return withPublicVendorMeta(
        products.slice(0, safeLimit),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase as any,
      );
    },
    [`public-products-${safeCountry}-${safeLimit}`],
    { revalidate: 60, tags: ["public-products"] },
  );

  return cached();
}

export async function listProductsForVendor(
  vendorId: string,
  options?: {
    page?: number;
    pageSize?: number;
    /** When set, only return that catalog workflow partition. */
    catalogKind?: ProductCatalogKind;
  },
): Promise<Product[]> {
  if (!getSupabasePublicEnv()) {
    return [];
  }

  const { normalizePageParams } = await import("@/lib/db/pagination");
  const { from, to } = normalizePageParams(options, {
    pageSize: 100,
    maxPageSize: 200,
  });

  const supabase = await createClient();
  let query = supabase
    .from("products")
    .select("*")
    .eq("vendor_id", vendorId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (options?.catalogKind) {
    query = query.eq("catalog_kind", options.catalogKind);
  }

  const { data, error } = await query;

  // Older DBs without catalog_kind: fall back and filter in memory.
  if (error && /catalog_kind/i.test(error.message)) {
    const { data: legacy } = await supabase
      .from("products")
      .select("*")
      .eq("vendor_id", vendorId)
      .order("created_at", { ascending: false })
      .range(from, to);
    const rows = ((legacy as Product[] | null) ?? []).map(normalizeProduct);
    if (!options?.catalogKind) return rows;
    if (options.catalogKind === "cj_import") {
      return rows.filter(
        (product) =>
          product.catalog_kind === "cj_import" ||
          (product.is_dropship && !product.source_product_id),
      );
    }
    return rows.filter(
      (product) =>
        product.catalog_kind !== "cj_import" &&
        !(product.is_dropship && !product.source_product_id),
    );
  }

  return ((data as Product[] | null) ?? []).map(normalizeProduct);
}

/** Manual vendor catalog only (excludes CJ Dropshipping imports). */
export async function listManualProductsForVendor(
  vendorId: string,
  options?: { page?: number; pageSize?: number },
): Promise<Product[]> {
  return listProductsForVendor(vendorId, {
    ...options,
    catalogKind: "manual",
  });
}

/** CJ Dropshipping imports only. */
export async function listCjImportedProductsForVendor(
  vendorId: string,
  options?: { page?: number; pageSize?: number },
): Promise<Product[]> {
  return listProductsForVendor(vendorId, {
    ...options,
    catalogKind: "cj_import",
  });
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

  const sourcing = await getBuyerSourcingContext();
  const [deliverable] = await filterDeliverableProducts(
    [normalizeProduct(productRow as Product)],
    sourcing.countryCode,
  );
  if (!deliverable) {
    return null;
  }

  const [detail] = await withPublicVendorMeta([deliverable]);
  return detail ?? null;
}


export async function listPublicProductsByVendorId(
  vendorId: string,
  limit = 48,
): Promise<PublicProductSummary[]> {
  if (!getSupabasePublicEnv()) {
    return [];
  }

  const sourcing = await getBuyerSourcingContext();
  const supabase = await createClient();
  const fetchLimit = Math.min(Math.max(limit * 4, limit), 200);
  const { data: productRows } = await supabase
    .from("products")
    .select("*")
    .eq("vendor_id", vendorId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(fetchLimit);

  const products = await filterDeliverableProducts(
    ((productRows as Product[] | null) ?? []).map(normalizeProduct),
    sourcing.countryCode,
  );
  return withPublicVendorMeta(products.slice(0, limit));
}
