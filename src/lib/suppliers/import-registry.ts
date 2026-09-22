/**
 * Resolve CJ / external import metadata for a product.
 * Prefer `cj_imported_products` (always present for CJ imports on this project);
 * fall back to `external_product_imports` when that table exists.
 */

export type ImportedCatalogVariant = {
  externalVariantId: string;
  externalSku: string | null;
  label: string;
  priceUsdt: number | null;
  stockQuantity: number | null;
  imageUrl: string | null;
};

export type ImportRegistryRow = {
  product_id: string;
  external_product_id: string;
  external_variant_id: string | null;
  external_sku: string | null;
  provider_id: string | null;
  source_payload: Record<string, unknown> | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

/** Parse the full color/size matrix stored on import source_payload. */
export function catalogVariantsFromSourcePayload(
  payload: Record<string, unknown> | null | undefined,
): ImportedCatalogVariant[] {
  if (!payload) return [];
  const rawVariants = Array.isArray(payload.variants) ? payload.variants : [];
  const out: ImportedCatalogVariant[] = [];
  const seen = new Set<string>();

  for (const item of rawVariants) {
    const row = asRecord(item);
    if (!row) continue;
    const externalVariantId = String(
      row.externalVariantId ?? row.vid ?? "",
    ).trim();
    if (!externalVariantId || seen.has(externalVariantId)) continue;
    seen.add(externalVariantId);
    const label = String(
      row.label ?? row.variantNameEn ?? row.variantKey ?? externalVariantId,
    ).trim();
    const priceRaw = row.priceUsdt ?? row.variantSellPrice;
    const stockRaw = row.stockQuantity ?? row.totalInventory;
    out.push({
      externalVariantId,
      externalSku:
        row.externalSku != null
          ? String(row.externalSku)
          : row.variantSku != null
            ? String(row.variantSku)
            : null,
      label: label || externalVariantId,
      priceUsdt:
        typeof priceRaw === "number"
          ? priceRaw
          : priceRaw != null && Number.isFinite(Number(priceRaw))
            ? Number(priceRaw)
            : null,
      stockQuantity:
        typeof stockRaw === "number"
          ? stockRaw
          : stockRaw != null && Number.isFinite(Number(stockRaw))
            ? Number(stockRaw)
            : null,
      imageUrl:
        row.imageUrl != null
          ? String(row.imageUrl)
          : row.variantImage != null
            ? String(row.variantImage)
            : null,
    });
  }

  return out;
}

function normalizeImportRow(row: Record<string, unknown>): ImportRegistryRow | null {
  const productId = String(row.product_id ?? "").trim();
  const externalProductId = String(row.external_product_id ?? "").trim();
  if (!productId || !externalProductId) return null;
  return {
    product_id: productId,
    external_product_id: externalProductId,
    external_variant_id:
      row.external_variant_id != null
        ? String(row.external_variant_id)
        : null,
    external_sku:
      row.external_sku != null ? String(row.external_sku) : null,
    provider_id: row.provider_id != null ? String(row.provider_id) : null,
    source_payload: asRecord(row.source_payload),
  };
}

/**
 * Load import registry rows for product ids from CJ registry and/or legacy
 * external_product_imports. CJ registry wins on conflict (has bulk variants).
 */
export async function loadImportRegistryByProductIds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  productIds: string[],
): Promise<Map<string, ImportRegistryRow>> {
  const byProduct = new Map<string, ImportRegistryRow>();
  const ids = [...new Set(productIds.filter(Boolean))];
  if (ids.length === 0) return byProduct;

  const selectCols =
    "product_id, external_product_id, external_variant_id, external_sku, provider_id, source_payload";

  const { data: cjRows, error: cjError } = await supabase
    .from("cj_imported_products")
    .select(selectCols)
    .in("product_id", ids);

  if (cjError && !/schema cache|does not exist|could not find/i.test(cjError.message ?? "")) {
    console.warn("cj_imported_products lookup:", cjError.message);
  }

  for (const raw of cjRows ?? []) {
    const row = normalizeImportRow(raw as Record<string, unknown>);
    if (row) byProduct.set(row.product_id, row);
  }

  const missing = ids.filter((id) => !byProduct.has(id));
  if (missing.length === 0) return byProduct;

  const { data: legacyRows, error: legacyError } = await supabase
    .from("external_product_imports")
    .select(selectCols)
    .in("product_id", missing);

  if (
    legacyError &&
    !/schema cache|does not exist|could not find|404/i.test(
      legacyError.message ?? "",
    )
  ) {
    console.warn("external_product_imports lookup:", legacyError.message);
  }

  for (const raw of legacyRows ?? []) {
    const row = normalizeImportRow(raw as Record<string, unknown>);
    if (row && !byProduct.has(row.product_id)) {
      byProduct.set(row.product_id, row);
    }
  }

  return byProduct;
}

export async function loadImportRegistryForProduct(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  productId: string,
): Promise<ImportRegistryRow | null> {
  const map = await loadImportRegistryByProductIds(supabase, [productId]);
  return map.get(productId) ?? null;
}
