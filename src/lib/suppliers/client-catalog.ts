/**
 * Normalize supplier catalog JSON for client components.
 * Handles camelCase / snake_case drift and nested payload shapes so a 200
 * response with products still renders even when field names differ slightly.
 */

import type {
  ExternalCatalogProduct,
  ExternalProductVariant,
  ExternalSupplierKind,
} from "@/lib/suppliers/types";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseKind(value: string | null): ExternalSupplierKind | null {
  if (!value) return null;
  const raw = value.trim().toLowerCase();
  if (raw === "cj" || raw === "cj_dropshipping" || raw === "cj-dropshipping") {
    return "cj_dropshipping";
  }
  if (raw === "dsers" || raw === "dser" || raw === "aliexpress") return "dsers";
  if (raw === "spocket") return "spocket";
  if (raw === "printful") return "printful";
  if (raw === "printify") return "printify";
  return null;
}

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asString(item))
    .filter((item): item is string => Boolean(item));
}

function normalizeVariant(raw: unknown): ExternalProductVariant | null {
  const row = asRecord(raw);
  if (!row) return null;
  const externalVariantId = asString(
    row.externalVariantId ?? row.external_variant_id ?? row.vid ?? row.id,
  );
  if (!externalVariantId) return null;
  const price =
    asNumber(row.priceUsdt ?? row.price_usdt ?? row.price ?? row.sellPrice) ??
    0.01;
  return {
    externalVariantId,
    externalSku: asString(
      row.externalSku ?? row.external_sku ?? row.sku ?? row.variantSku,
    ),
    label:
      asString(row.label ?? row.name ?? row.variantName ?? row.sku) ??
      externalVariantId,
    priceUsdt: price > 0 ? price : 0.01,
    stockQuantity: asNumber(
      row.stockQuantity ?? row.stock_quantity ?? row.stock ?? row.inventory,
    ),
    imageUrl: asString(row.imageUrl ?? row.image_url ?? row.image),
  };
}

/**
 * Map one wire product (camelCase or snake_case) into ExternalCatalogProduct.
 * Returns null when the row cannot be shown (missing id / provider).
 */
export function normalizeClientCatalogProduct(
  raw: unknown,
): ExternalCatalogProduct | null {
  const row = asRecord(raw);
  if (!row) return null;

  const providerKind = parseKind(
    asString(
      row.providerKind ??
        row.provider_kind ??
        row.provider ??
        row.source ??
        row.kind,
    ),
  );
  const externalProductId = asString(
    row.externalProductId ??
      row.external_product_id ??
      row.pid ??
      row.productId ??
      row.id,
  );
  if (!providerKind || !externalProductId) return null;

  const variantsRaw = row.variants ?? row.productVariants ?? row.variantList;
  const variants = Array.isArray(variantsRaw)
    ? variantsRaw
        .map(normalizeVariant)
        .filter((v): v is ExternalProductVariant => v != null)
    : undefined;

  const priceUsdt =
    asNumber(row.priceUsdt ?? row.price_usdt ?? row.price) ??
    variants?.[0]?.priceUsdt ??
    0.01;

  const images = asStringArray(row.images ?? row.imageList);
  const imageUrl =
    asString(row.imageUrl ?? row.image_url ?? row.image) ?? images[0] ?? null;

  const warehouseCountry =
    asString(
      row.warehouseCountry ??
        row.warehouse_country ??
        row.warehouseCountryCode ??
        row.countryCode ??
        row.country,
    ) ?? "CN";

  return {
    providerKind,
    externalProductId,
    externalVariantId:
      asString(
        row.externalVariantId ??
          row.external_variant_id ??
          row.vid ??
          variants?.[0]?.externalVariantId,
      ) ?? null,
    externalSku:
      asString(
        row.externalSku ??
          row.external_sku ??
          row.sku ??
          variants?.[0]?.externalSku,
      ) ?? null,
    name:
      asString(row.name ?? row.title ?? row.productName ?? row.productNameEn) ??
      "Product",
    description: asString(
      row.description ?? row.productDescription ?? row.desc,
    ),
    imageUrl,
    images: images.length > 0 ? images : imageUrl ? [imageUrl] : [],
    priceUsdt: priceUsdt > 0 ? priceUsdt : 0.01,
    compareAtPriceUsdt: asNumber(
      row.compareAtPriceUsdt ?? row.compare_at_price_usdt ?? row.compareAtPrice,
    ),
    stockQuantity: asNumber(
      row.stockQuantity ?? row.stock_quantity ?? row.stock ?? row.inventory,
    ),
    warehouseCountry,
    shippingDaysMin: asNumber(
      row.shippingDaysMin ?? row.shipping_days_min ?? row.daysMin,
    ),
    shippingDaysMax: asNumber(
      row.shippingDaysMax ?? row.shipping_days_max ?? row.daysMax,
    ),
    variants: variants && variants.length > 0 ? variants : undefined,
    raw: {},
  };
}

/** Pull a product array from common API envelope shapes. */
export function extractCatalogProducts(payload: unknown): ExternalCatalogProduct[] {
  const root = asRecord(payload);
  if (!root) return [];

  const candidates: unknown[] = [
    root.products,
    root.items,
    root.results,
    asRecord(root.data)?.products,
    asRecord(root.data)?.items,
    asRecord(root.catalog)?.products,
  ];

  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;
    const products = candidate
      .map(normalizeClientCatalogProduct)
      .filter((p): p is ExternalCatalogProduct => p != null);
    if (products.length > 0 || candidate.length === 0) {
      return products;
    }
  }

  return [];
}

/** Safe warehouse check — never throw on missing country. */
export function isLocalWarehouseCountry(country: string | null | undefined) {
  const code = (country ?? "").trim().toUpperCase();
  if (!code) return false;
  return ["US", "EU", "GB", "DE", "FR", "MM", "TH", "SG"].includes(code);
}
