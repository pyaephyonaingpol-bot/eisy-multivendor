import "server-only";

import { createServiceClient } from "@/lib/supabase/admin";
import { freightCalculateCjShipping } from "@/lib/suppliers/cj";
import { verifyCjLiveVariantStock } from "@/lib/suppliers/cj-live-stock";
import { loadPlatformSupplierContext } from "@/lib/suppliers/platform-credentials";
import {
  useLiveSupplierApi,
  type SupplierCredentials,
} from "@/lib/suppliers/types";

export const CJ_NO_SHIP_CUSTOMER_MESSAGE =
  "Sorry, CJ Dropshipping does not ship to your location. Choose another country or remove CJ items from your cart.";

export const CJ_NO_SHIP_VENDOR_MESSAGE =
  "Shipping Unavailable — CJ does not ship to this region";

export type CjShippingCartItem = {
  product_id: string;
  quantity: number;
};

export type CjShippingQuoteMethod = {
  name: string;
  days: string | null;
  amount: number | null;
  currency: string;
};

export type CjAvailabilityQuote = {
  status: "in_stock" | "out_of_stock" | "unknown" | "skipped";
  available: number | null;
  message: string | null;
};

export type CjShippingQuoteResult =
  | {
      ok: true;
      skipped: boolean;
      hasCjItems: boolean;
      methods: CjShippingQuoteMethod[];
      countryCode: string;
      availability: CjAvailabilityQuote;
    }
  | {
      ok: false;
      skipped: boolean;
      hasCjItems: boolean;
      methods: CjShippingQuoteMethod[];
      countryCode: string;
      error: string;
      availability: CjAvailabilityQuote;
    };

type CjCartLine = {
  productId: string;
  productName: string;
  quantity: number;
  vid: string;
  warehouseCountry: string | null;
  externalProductId: string | null;
  externalVariantId: string | null;
  externalSku: string | null;
};

const SKIPPED_AVAILABILITY: CjAvailabilityQuote = {
  status: "skipped",
  available: null,
  message: null,
};

async function resolveCjCartLines(
  items: CjShippingCartItem[],
): Promise<CjCartLine[]> {
  const productIds = [
    ...new Set(items.map((item) => item.product_id).filter(Boolean)),
  ];
  if (productIds.length === 0) return [];

  const supabase = createServiceClient();
  const { loadImportRegistryByProductIds } = await import(
    "@/lib/suppliers/import-registry"
  );
  const [{ data: products }, { data: cjProviders }, importByProduct] =
    await Promise.all([
      supabase
        .from("products")
        .select("id, name, sku, catalog_kind, is_dropship, origin_country_code")
        .in("id", productIds),
      supabase
        .from("supplier_providers")
        .select("id, kind, slug")
        .or(
          "kind.eq.cj_dropshipping,slug.eq.cj-dropshipping,slug.eq.cj_dropshipping",
        ),
      loadImportRegistryByProductIds(supabase, productIds),
    ]);

  const cjProviderIds = new Set((cjProviders ?? []).map((row) => row.id));
  const productById = new Map((products ?? []).map((row) => [row.id, row]));

  const qtyByProduct = new Map<string, number>();
  for (const item of items) {
    qtyByProduct.set(
      item.product_id,
      (qtyByProduct.get(item.product_id) ?? 0) +
        Math.max(0, Number(item.quantity) || 0),
    );
  }

  const lines: CjCartLine[] = [];
  for (const [productId, quantity] of qtyByProduct) {
    const product = productById.get(productId);
    if (!product) continue;

    const imported = importByProduct.get(productId);
    if (
      imported?.provider_id &&
      cjProviderIds.size > 0 &&
      !cjProviderIds.has(imported.provider_id)
    ) {
      // Non-CJ provider import row — skip unless catalog_kind marks CJ.
      if (product.catalog_kind !== "cj_import") continue;
    }
    const isCjProduct =
      Boolean(imported) ||
      product.catalog_kind === "cj_import" ||
      Boolean(product.is_dropship && imported);

    if (!isCjProduct) continue;

    const vid = String(
      imported?.external_variant_id ||
        imported?.external_sku ||
        imported?.external_product_id ||
        product.sku ||
        "",
    ).trim();
    if (!vid) continue;

    lines.push({
      productId,
      productName: product.name ?? "CJ product",
      quantity: Math.max(1, quantity),
      vid,
      warehouseCountry: product.origin_country_code ?? "CN",
      externalProductId: imported?.external_product_id
        ? String(imported.external_product_id)
        : null,
      externalVariantId: imported?.external_variant_id
        ? String(imported.external_variant_id)
        : null,
      externalSku: imported?.external_sku
        ? String(imported.external_sku)
        : product.sku
          ? String(product.sku)
          : null,
    });
  }

  return lines;
}

async function quoteCjAvailability(
  lines: CjCartLine[],
  credentials: SupplierCredentials | null,
): Promise<CjAvailabilityQuote> {
  if (lines.length === 0) return SKIPPED_AVAILABILITY;

  let lowestAvailable: number | null = null;
  let sawLive = false;

  for (const line of lines) {
    const result = await verifyCjLiveVariantStock(
      {
        productId: line.productId,
        productName: line.productName,
        externalProductId: line.externalProductId,
        externalVariantId: line.externalVariantId,
        externalSku: line.externalSku ?? line.vid,
        quantity: line.quantity,
      },
      credentials,
    );

    if ("skipped" in result && result.skipped) {
      continue;
    }

    sawLive = true;

    if (!result.ok) {
      return {
        status: "out_of_stock",
        available: result.available,
        message: result.error,
      };
    }

    if (result.available != null) {
      lowestAvailable =
        lowestAvailable == null
          ? result.available
          : Math.min(lowestAvailable, result.available);
    }
  }

  if (!sawLive) {
    return SKIPPED_AVAILABILITY;
  }

  if (lowestAvailable == null) {
    return {
      status: "unknown",
      available: null,
      message: "Live CJ inventory could not be confirmed for this listing.",
    };
  }

  return {
    status: lowestAvailable > 0 ? "in_stock" : "out_of_stock",
    available: lowestAvailable,
    message:
      lowestAvailable > 0
        ? null
        : "This product is currently out of stock at CJ Dropshipping.",
  };
}

/**
 * Live freight + availability quote for CJ cart/browse lines to a destination.
 * Used by product browsing, checkout UI, and API. Empty methods ⇒ unsupported country.
 */
export async function quoteCjShippingForCartItems(
  items: CjShippingCartItem[],
  countryCode: string,
  options?: {
    zip?: string | null;
    credentials?: SupplierCredentials | null;
    includeAvailability?: boolean;
  },
): Promise<CjShippingQuoteResult> {
  const normalizedCountry = countryCode.trim().toUpperCase() || "MM";
  const lines = await resolveCjCartLines(items);
  const includeAvailability = options?.includeAvailability !== false;

  if (lines.length === 0) {
    return {
      ok: true,
      skipped: true,
      hasCjItems: false,
      methods: [],
      countryCode: normalizedCountry,
      availability: SKIPPED_AVAILABILITY,
    };
  }

  const linked =
    options?.credentials !== undefined
      ? { credentials: options.credentials ?? null }
      : await loadPlatformSupplierContext("cj_dropshipping");
  const creds = linked?.credentials ?? null;

  if (!useLiveSupplierApi("cj_dropshipping", creds)) {
    // Mock mode: do not invent methods; checkout still allowed without live CJ.
    return {
      ok: true,
      skipped: true,
      hasCjItems: true,
      methods: [],
      countryCode: normalizedCountry,
      availability: SKIPPED_AVAILABILITY,
    };
  }

  const startCountry =
    lines.find((line) => line.warehouseCountry)?.warehouseCountry?.trim() ||
    "CN";

  const [freight, availability] = await Promise.all([
    freightCalculateCjShipping(
      {
        startCountryCode: startCountry,
        endCountryCode: normalizedCountry,
        zip: options?.zip,
        products: lines.map((line) => ({
          vid: line.vid,
          quantity: line.quantity,
        })),
      },
      creds,
    ),
    includeAvailability
      ? quoteCjAvailability(lines, creds)
      : Promise.resolve(SKIPPED_AVAILABILITY),
  ]);

  const methods: CjShippingQuoteMethod[] = freight.methods.map((method) => ({
    name: method.logisticName,
    days: method.logisticAge,
    amount: method.freightAmount,
    currency: method.currency,
  }));

  if (!freight.ok) {
    const errLower = (freight.error ?? "").toLowerCase();
    const unsupported =
      errLower.includes("ship") ||
      errLower.includes("logistic") ||
      errLower.includes("country") ||
      errLower.includes("destination") ||
      errLower.includes("not support");
    return {
      ok: false,
      skipped: false,
      hasCjItems: true,
      methods,
      countryCode: normalizedCountry,
      availability,
      error: unsupported
        ? `Sorry, CJ Dropshipping does not ship to your location (${normalizedCountry}).${
            freight.error ? ` ${freight.error}` : ""
          }`
        : CJ_NO_SHIP_CUSTOMER_MESSAGE,
    };
  }

  if (methods.length === 0) {
    return {
      ok: false,
      skipped: false,
      hasCjItems: true,
      methods: [],
      countryCode: normalizedCountry,
      availability,
      error: CJ_NO_SHIP_CUSTOMER_MESSAGE,
    };
  }

  return {
    ok: true,
    skipped: false,
    hasCjItems: true,
    methods,
    countryCode: normalizedCountry,
    availability,
  };
}

/**
 * Checkout gate: block payment when CJ has no shipping method for destination.
 */
export async function assertCjShipsToDestinationForCartItems(
  items: CjShippingCartItem[],
  countryCode: string,
  options?: { zip?: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const quote = await quoteCjShippingForCartItems(items, countryCode, {
    zip: options?.zip,
    includeAvailability: false,
  });
  if (!quote.ok) {
    return { ok: false, error: quote.error };
  }
  return { ok: true };
}

export function isCjShippingUnavailableError(message: string | null | undefined) {
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes("does not ship") ||
    lower.includes("shipping unavailable") ||
    lower.includes("no available shipping") ||
    lower.includes("no shipping method")
  );
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index]!);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(items.length, 1)) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

/**
 * Location filter for marketplace catalog: keep non-CJ products, and only CJ
 * listings that have at least one live freight method to `countryCode`.
 * When CJ live API is disabled, CJ products are kept (mock/offline fail-open).
 */
export async function filterCjProductsShippableToCountry(
  productIds: string[],
  countryCode: string,
): Promise<Set<string>> {
  const uniqueIds = [...new Set(productIds.filter(Boolean))];
  const allowed = new Set(uniqueIds);
  if (uniqueIds.length === 0) return allowed;

  const normalizedCountry = countryCode.trim().toUpperCase() || "MM";
  const lines = await resolveCjCartLines(
    uniqueIds.map((productId) => ({ product_id: productId, quantity: 1 })),
  );

  if (lines.length === 0) {
    return allowed;
  }

  const cjProductIds = new Set(lines.map((line) => line.productId));
  const linked = await loadPlatformSupplierContext("cj_dropshipping");
  const creds = linked?.credentials ?? null;

  if (!useLiveSupplierApi("cj_dropshipping", creds)) {
    return allowed;
  }

  // Without a variant id we cannot verify freight — hide those CJ listings live.
  for (const productId of cjProductIds) {
    if (!lines.some((line) => line.productId === productId && line.vid)) {
      allowed.delete(productId);
    }
  }

  const uniqueLines = [
    ...new Map(lines.filter((line) => line.vid).map((line) => [line.productId, line])).values(),
  ];

  const shipChecks = await mapPool(uniqueLines, 4, async (line) => {
    const freight = await freightCalculateCjShipping(
      {
        startCountryCode: line.warehouseCountry?.trim() || "CN",
        endCountryCode: normalizedCountry,
        products: [{ vid: line.vid, quantity: 1 }],
      },
      creds,
    );
    const ok = freight.ok && freight.methods.length > 0;
    return { productId: line.productId, ok };
  });

  for (const check of shipChecks) {
    if (!check.ok) {
      allowed.delete(check.productId);
    }
  }

  return allowed;
}
