/**
 * Shipping buffer baked into CJ (and other dropship) import listing prices.
 *
 * Prefer live CJ freightCalculate for the seller's target country; fall back to
 * weight-bracket rules from CJ productWeight / packingWeight when freight is
 * unavailable (mock mode, missing vid, API errors).
 *
 * Sync helpers in this module are safe for client components. Live freight
 * uses a dynamic import so Next does not bundle the CJ adapter into the browser.
 */

import {
  ONE_CLICK_IMPORT_MARKUP,
  type ExternalCatalogProduct,
  type SupplierCredentials,
} from "@/lib/suppliers/types";

/** Extra margin on top of estimated freight so listing price covers surprises. */
export const SHIPPING_BUFFER_SAFETY_PCT = 0.1;

/** Popular seller target markets for “price for country” on import. */
export const IMPORT_SHIPPING_TARGET_COUNTRIES: Array<{
  code: string;
  label: string;
}> = [
  { code: "AE", label: "United Arab Emirates" },
  { code: "SA", label: "Saudi Arabia" },
  { code: "MM", label: "Myanmar" },
  { code: "TH", label: "Thailand" },
  { code: "SG", label: "Singapore" },
  { code: "US", label: "United States" },
  { code: "DE", label: "Germany" },
  { code: "GB", label: "United Kingdom" },
  { code: "AU", label: "Australia" },
];

/** Default target when the seller has not chosen a destination yet. */
export const DEFAULT_IMPORT_SHIPPING_COUNTRY = "AE";

type WeightBracket = {
  /** Fixed USDT overhead per shipment. */
  baseUsdt: number;
  /** USDT per kilogram (product packing weight). */
  perKgUsdt: number;
};

/** From-CN rough brackets used when live CJ freight is unavailable. */
const WEIGHT_BRACKETS_FROM_CN: Record<string, WeightBracket> = {
  AE: { baseUsdt: 1.5, perKgUsdt: 4.5 },
  SA: { baseUsdt: 1.5, perKgUsdt: 4.8 },
  BH: { baseUsdt: 1.5, perKgUsdt: 4.5 },
  KW: { baseUsdt: 1.5, perKgUsdt: 4.5 },
  OM: { baseUsdt: 1.5, perKgUsdt: 4.5 },
  QA: { baseUsdt: 1.5, perKgUsdt: 4.5 },
  MM: { baseUsdt: 1.2, perKgUsdt: 3.5 },
  TH: { baseUsdt: 1.0, perKgUsdt: 3.0 },
  SG: { baseUsdt: 1.0, perKgUsdt: 3.2 },
  MY: { baseUsdt: 1.0, perKgUsdt: 3.0 },
  US: { baseUsdt: 2.0, perKgUsdt: 6.0 },
  CA: { baseUsdt: 2.0, perKgUsdt: 6.0 },
  DE: { baseUsdt: 1.8, perKgUsdt: 5.5 },
  FR: { baseUsdt: 1.8, perKgUsdt: 5.5 },
  GB: { baseUsdt: 1.8, perKgUsdt: 5.5 },
  AU: { baseUsdt: 2.0, perKgUsdt: 6.5 },
  CN: { baseUsdt: 0.5, perKgUsdt: 1.0 },
};

const DEFAULT_BRACKET: WeightBracket = { baseUsdt: 1.5, perKgUsdt: 5.0 };

/** Map sourcing region codes → a representative ISO country for freight. */
export function regionCodeToShippingCountry(regionCode: string | null | undefined): string {
  const code = String(regionCode ?? "")
    .trim()
    .toUpperCase();
  switch (code) {
    case "GCC":
      return "AE";
    case "MM":
      return "MM";
    case "SEA":
      return "TH";
    case "CN":
      return "CN";
    case "EU":
      return "DE";
    case "US":
      return "US";
    case "GLOBAL":
    default:
      return DEFAULT_IMPORT_SHIPPING_COUNTRY;
  }
}

export function normalizeImportShippingCountry(
  value: string | null | undefined,
): string {
  const code = String(value ?? "")
    .trim()
    .toUpperCase()
    .slice(0, 2);
  return /^[A-Z]{2}$/.test(code) ? code : DEFAULT_IMPORT_SHIPPING_COUNTRY;
}

function parseWeightGrams(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  const text = String(value).trim().toLowerCase();
  if (!text) return null;
  const kg = text.match(/^([\d.]+)\s*kg$/);
  if (kg) {
    const n = Number(kg[1]);
    return Number.isFinite(n) && n > 0 ? n * 1000 : null;
  }
  const g = text.match(/^([\d.]+)\s*g(?:ram)?s?$/);
  if (g) {
    const n = Number(g[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const bare = Number(text.replace(/[^\d.]/g, ""));
  return Number.isFinite(bare) && bare > 0 ? bare : null;
}

/**
 * Parse CJ productWeight / packingWeight fields (grams or kg strings).
 * Prefer packing weight when both exist.
 */
export function parseCjWeightGrams(row: Record<string, unknown>): number | null {
  return (
    parseWeightGrams(row.packingWeight) ??
    parseWeightGrams(row.packWeight) ??
    parseWeightGrams(row.productWeight) ??
    parseWeightGrams(row.weight) ??
    null
  );
}

/** Prefer packing weight, then product weight, from mapped fields or CJ raw. */
export function extractProductWeightGrams(
  product: Pick<
    ExternalCatalogProduct,
    "weightGrams" | "specifications" | "raw"
  >,
): number | null {
  if (
    product.weightGrams != null &&
    Number.isFinite(product.weightGrams) &&
    product.weightGrams > 0
  ) {
    return product.weightGrams;
  }

  const raw = product.raw ?? {};
  const fromRaw = parseCjWeightGrams(raw);
  if (fromRaw != null) return fromRaw;

  for (const spec of product.specifications ?? []) {
    const key = spec.key.toLowerCase();
    if (
      key.includes("packing weight") ||
      key === "weight" ||
      key.includes("product weight")
    ) {
      const grams = parseWeightGrams(spec.value);
      if (grams != null) return grams;
    }
  }

  return null;
}

export function estimateWeightBracketShippingUsdt(
  weightGrams: number | null | undefined,
  destinationCountry: string,
): number {
  const country = normalizeImportShippingCountry(destinationCountry);
  const bracket = WEIGHT_BRACKETS_FROM_CN[country] ?? DEFAULT_BRACKET;
  // Unknown weight → assume 0.3 kg (light gadget) so buffer is never zero.
  const grams =
    weightGrams != null && Number.isFinite(weightGrams) && weightGrams > 0
      ? weightGrams
      : 300;
  const kg = Math.max(0.05, grams / 1000);
  const amount = bracket.baseUsdt + kg * bracket.perKgUsdt;
  return Math.round(amount * 100) / 100;
}

function applySafetyMargin(freightUsdt: number): number {
  const withMargin = freightUsdt * (1 + SHIPPING_BUFFER_SAFETY_PCT);
  return Math.round(Math.max(0, withMargin) * 100) / 100;
}

export type ShippingBufferEstimate = {
  destinationCountry: string;
  warehouseCountry: string;
  weightGrams: number | null;
  freightUsdt: number;
  bufferUsdt: number;
  source: "cj_freight" | "weight_bracket" | "none";
  methodName: string | null;
  error?: string;
};

/**
 * Sync bracket-only estimate for catalog cards / first paint (no CJ API).
 */
export function estimateShippingBufferFromWeight(args: {
  product: Pick<
    ExternalCatalogProduct,
    "weightGrams" | "specifications" | "raw" | "warehouseCountry"
  >;
  destinationCountry: string;
}): ShippingBufferEstimate {
  const destinationCountry = normalizeImportShippingCountry(
    args.destinationCountry,
  );
  const warehouseCountry =
    String(args.product.warehouseCountry ?? "CN")
      .trim()
      .toUpperCase()
      .slice(0, 2) || "CN";
  const weightGrams = extractProductWeightGrams(args.product);
  const freightUsdt = estimateWeightBracketShippingUsdt(
    weightGrams,
    destinationCountry,
  );
  return {
    destinationCountry,
    warehouseCountry,
    weightGrams,
    freightUsdt,
    bufferUsdt: applySafetyMargin(freightUsdt),
    source: "weight_bracket",
    methodName: null,
  };
}

/**
 * Estimate the shipping buffer to bake into an import listing price.
 * Tries live CJ freight first; falls back to weight brackets.
 */
export async function estimateImportShippingBuffer(args: {
  product: ExternalCatalogProduct;
  destinationCountry: string;
  credentials?: SupplierCredentials | null;
  variantId?: string | null;
}): Promise<ShippingBufferEstimate> {
  const destinationCountry = normalizeImportShippingCountry(
    args.destinationCountry,
  );
  const warehouseCountry =
    String(args.product.warehouseCountry ?? "CN")
      .trim()
      .toUpperCase()
      .slice(0, 2) || "CN";
  const weightGrams = extractProductWeightGrams(args.product);
  const vid =
    String(
      args.variantId ||
        args.product.externalVariantId ||
        args.product.variants?.[0]?.externalVariantId ||
        "",
    ).trim() || null;

  if (vid) {
    try {
      const { freightCalculateCjShipping } = await import("@/lib/suppliers/cj");
      const freight = await freightCalculateCjShipping(
        {
          startCountryCode: warehouseCountry,
          endCountryCode: destinationCountry,
          products: [{ vid, quantity: 1 }],
        },
        args.credentials,
      );

      const priced = freight.methods
        .filter(
          (method) =>
            method.freightAmount != null &&
            Number.isFinite(method.freightAmount) &&
            (method.freightAmount as number) >= 0,
        )
        .sort(
          (a, b) => (a.freightAmount as number) - (b.freightAmount as number),
        );

      if (priced[0]) {
        const freightUsdt = Number(priced[0].freightAmount);
        return {
          destinationCountry,
          warehouseCountry,
          weightGrams,
          freightUsdt,
          bufferUsdt: applySafetyMargin(freightUsdt),
          source: "cj_freight",
          methodName: priced[0].logisticName,
        };
      }

      if (freight.error) {
        // Fall through to weight brackets.
      }
    } catch {
      // Fall through to weight brackets.
    }
  }

  const freightUsdt = estimateWeightBracketShippingUsdt(
    weightGrams,
    destinationCountry,
  );
  return {
    destinationCountry,
    warehouseCountry,
    weightGrams,
    freightUsdt,
    bufferUsdt: applySafetyMargin(freightUsdt),
    source: "weight_bracket",
    methodName: null,
    error: vid
      ? "Live CJ freight unavailable — used weight bracket estimate."
      : "Missing CJ variant id — used weight bracket estimate.",
  };
}

/** One-click / suggested sell price = cost markup + shipping buffer. */
export function sellPriceWithShippingBuffer(
  supplierCostUsdt: number,
  shippingBufferUsdt: number,
  markup = ONE_CLICK_IMPORT_MARKUP,
): number {
  const cost = Number.isFinite(supplierCostUsdt)
    ? Math.max(0, supplierCostUsdt)
    : 0;
  const buffer = Number.isFinite(shippingBufferUsdt)
    ? Math.max(0, shippingBufferUsdt)
    : 0;
  const price = cost * markup + buffer;
  return Math.round(Math.max(price, cost) * 100) / 100;
}

/** Client-safe suggested import price using weight brackets only. */
export function suggestedImportSellPrice(
  supplierCostUsdt: number,
  product: Pick<
    ExternalCatalogProduct,
    "weightGrams" | "specifications" | "raw" | "warehouseCountry"
  >,
  destinationCountry: string,
  markup = ONE_CLICK_IMPORT_MARKUP,
): { sellPrice: number; bufferUsdt: number } {
  const estimate = estimateShippingBufferFromWeight({
    product,
    destinationCountry,
  });
  return {
    sellPrice: sellPriceWithShippingBuffer(
      supplierCostUsdt,
      estimate.bufferUsdt,
      markup,
    ),
    bufferUsdt: estimate.bufferUsdt,
  };
}
