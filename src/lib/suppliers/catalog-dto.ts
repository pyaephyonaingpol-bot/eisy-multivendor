/**
 * Slim supplier catalog DTOs for client responses and DB source_payload.
 * Never ship full CJ/DSers raw API blobs to the browser or store them wholesale.
 */

import type {
  ExternalCatalogProduct,
  ExternalInventorySnapshot,
  ExternalProductVariant,
} from "@/lib/suppliers/types";

const MAX_DESCRIPTION_CHARS = 4000;
const MAX_IMAGES = 12;

export type ClientCatalogProduct = Omit<ExternalCatalogProduct, "raw"> & {
  /** Intentionally omitted on the wire — use server-side mapping for import. */
  raw?: undefined;
  /** True when the row came from the local mock catalog (no live API). */
  isMock?: boolean;
};

function truncateText(value: string | null | undefined, max: number): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

function slimVariants(
  variants: ExternalProductVariant[] | undefined,
): ExternalProductVariant[] | undefined {
  if (!variants?.length) return undefined;
  // CJ products can expose large color/size matrices — keep a high ceiling so
  // preview/import can show every option returned by the API.
  return variants.slice(0, 250).map((variant) => ({
    externalVariantId: variant.externalVariantId,
    externalSku: variant.externalSku,
    label: variant.label,
    priceUsdt: variant.priceUsdt,
    stockQuantity: variant.stockQuantity,
    imageUrl: variant.imageUrl,
  }));
}

function isMockProduct(product: ExternalCatalogProduct): boolean {
  const raw = product.raw;
  if (raw && typeof raw === "object" && "mock" in raw && raw.mock === true) {
    return true;
  }
  const id = product.externalProductId ?? "";
  return (
    id.includes("-MOCK-") ||
    id.startsWith("CJ-MOCK-") ||
    id.startsWith("AE-MOCK-") ||
    id.startsWith("SPK-MOCK-") ||
    id.startsWith("PF-MOCK-") ||
    id.startsWith("PY-MOCK-")
  );
}

/** Strip heavy `raw` blobs before JSON responses to the browser. */
export function toClientCatalogProduct(
  product: ExternalCatalogProduct,
): ClientCatalogProduct {
  const { raw: _raw, ...rest } = product;
  void _raw;
  return {
    ...rest,
    description: truncateText(product.description, MAX_DESCRIPTION_CHARS),
    images: (product.images ?? []).slice(0, MAX_IMAGES),
    variants: slimVariants(product.variants),
    isMock: isMockProduct(product),
  };
}

export function toClientCatalogProducts(
  products: ExternalCatalogProduct[],
): ClientCatalogProduct[] {
  return products.map(toClientCatalogProduct);
}

/**
 * Curated jsonb stored on external_product_imports.source_payload.
 * Keeps ids, pricing, stock, and images — drops HTML/customization trees.
 */
export function toImportSourcePayload(
  product: ExternalCatalogProduct,
): Record<string, unknown> {
  return {
    providerKind: product.providerKind,
    externalProductId: product.externalProductId,
    externalVariantId: product.externalVariantId,
    externalSku: product.externalSku,
    name: product.name,
    description: truncateText(product.description, MAX_DESCRIPTION_CHARS),
    imageUrl: product.imageUrl,
    images: (product.images ?? []).slice(0, MAX_IMAGES),
    priceUsdt: product.priceUsdt,
    compareAtPriceUsdt: product.compareAtPriceUsdt,
    stockQuantity: product.stockQuantity,
    warehouseCountry: product.warehouseCountry,
    shippingDaysMin: product.shippingDaysMin,
    shippingDaysMax: product.shippingDaysMax,
    variants: slimVariants(product.variants),
    capturedAt: new Date().toISOString(),
  };
}

export function toSlimInventoryRaw(
  snapshot: ExternalInventorySnapshot,
): Record<string, unknown> {
  return {
    externalProductId: snapshot.externalProductId,
    externalVariantId: snapshot.externalVariantId,
    externalSku: snapshot.externalSku,
    priceUsdt: snapshot.priceUsdt,
    stockQuantity: snapshot.stockQuantity,
    capturedAt: new Date().toISOString(),
  };
}
