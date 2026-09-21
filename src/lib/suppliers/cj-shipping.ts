import "server-only";

import { createServiceClient } from "@/lib/supabase/admin";
import { freightCalculateCjShipping } from "@/lib/suppliers/cj";
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

export type CjShippingQuoteResult =
  | {
      ok: true;
      skipped: boolean;
      hasCjItems: boolean;
      methods: CjShippingQuoteMethod[];
      countryCode: string;
    }
  | {
      ok: false;
      skipped: boolean;
      hasCjItems: boolean;
      methods: CjShippingQuoteMethod[];
      countryCode: string;
      error: string;
    };

type CjCartLine = {
  productId: string;
  productName: string;
  quantity: number;
  vid: string;
  warehouseCountry: string | null;
};

async function resolveCjCartLines(
  items: CjShippingCartItem[],
): Promise<CjCartLine[]> {
  const productIds = [
    ...new Set(items.map((item) => item.product_id).filter(Boolean)),
  ];
  if (productIds.length === 0) return [];

  const supabase = createServiceClient();
  const [{ data: imports }, { data: products }, { data: cjProviders }] =
    await Promise.all([
      supabase
        .from("external_product_imports")
        .select(
          "product_id, external_product_id, external_variant_id, external_sku, provider_id",
        )
        .in("product_id", productIds),
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
    ]);

  const cjProviderIds = new Set((cjProviders ?? []).map((row) => row.id));
  const productById = new Map((products ?? []).map((row) => [row.id, row]));
  const importByProduct = new Map(
    (imports ?? [])
      .filter((row) => row.product_id && cjProviderIds.has(row.provider_id))
      .map((row) => [row.product_id as string, row]),
  );

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
    });
  }

  return lines;
}

/**
 * Live freight quote for CJ cart lines to a destination country.
 * Used by checkout UI and API. Empty methods ⇒ destination unsupported.
 */
export async function quoteCjShippingForCartItems(
  items: CjShippingCartItem[],
  countryCode: string,
  options?: { zip?: string | null; credentials?: SupplierCredentials | null },
): Promise<CjShippingQuoteResult> {
  const normalizedCountry = countryCode.trim().toUpperCase() || "MM";
  const lines = await resolveCjCartLines(items);

  if (lines.length === 0) {
    return {
      ok: true,
      skipped: true,
      hasCjItems: false,
      methods: [],
      countryCode: normalizedCountry,
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
    };
  }

  const startCountry =
    lines.find((line) => line.warehouseCountry)?.warehouseCountry?.trim() ||
    "CN";

  const freight = await freightCalculateCjShipping(
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
  );

  const methods: CjShippingQuoteMethod[] = freight.methods.map((method) => ({
    name: method.logisticName,
    days: method.logisticAge,
    amount: method.freightAmount,
    currency: method.currency,
  }));

  if (!freight.ok) {
    return {
      ok: false,
      skipped: false,
      hasCjItems: true,
      methods,
      countryCode: normalizedCountry,
      error:
        freight.error?.toLowerCase().includes("ship") ||
        freight.error?.toLowerCase().includes("logistic")
          ? `Sorry, CJ Dropshipping does not ship to your location (${normalizedCountry}). ${freight.error}`
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
      error: CJ_NO_SHIP_CUSTOMER_MESSAGE,
    };
  }

  return {
    ok: true,
    skipped: false,
    hasCjItems: true,
    methods,
    countryCode: normalizedCountry,
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
  const quote = await quoteCjShippingForCartItems(items, countryCode, options);
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
