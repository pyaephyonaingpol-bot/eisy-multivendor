/**
 * Multi-region shipping markets + buyer-facing pricing.
 *
 * Buffered markets (AE / PH / MM): shipping buffer is included in the selling
 * price → customers see Free Shipping. Settlement remains USDT.
 * Global: base listing price only → Plus Shipping Fee at checkout.
 */

import { createClient } from "@/lib/supabase/server";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { normalizeCountryCode } from "@/lib/sourcing/constants";

/** Markets where shipping is prepaid via a weight-bracket buffer. */
export const BUFFERED_SHIPPING_MARKETS = ["AE", "PH", "MM"] as const;
export type BufferedShippingMarket = (typeof BUFFERED_SHIPPING_MARKETS)[number];
export type TargetMarket = BufferedShippingMarket | "GLOBAL";
export type ShippingType = "included" | "plus_shipping";
export type BuyerDisplayCurrency = "AED" | "PHP" | "USD" | "USDT";

/** Approximate USDT→local display FX (USDT ≈ USD). */
export const DISPLAY_FX_FROM_USDT: Record<BuyerDisplayCurrency, number> = {
  USDT: 1,
  USD: 1,
  AED: 3.6725,
  PHP: 56.5,
};

export type ShippingBufferRow = {
  country_code: string;
  min_weight_g: number;
  max_weight_g: number;
  buffer_amount_usd: number;
};

/** Fallback brackets when DB is unavailable (mirrors migration 074 seeds). */
export const FALLBACK_SHIPPING_BUFFERS: ShippingBufferRow[] = [
  { country_code: "AE", min_weight_g: 0, max_weight_g: 250, buffer_amount_usd: 2.2 },
  { country_code: "AE", min_weight_g: 250, max_weight_g: 500, buffer_amount_usd: 3.1 },
  { country_code: "AE", min_weight_g: 500, max_weight_g: 1000, buffer_amount_usd: 4.5 },
  { country_code: "AE", min_weight_g: 1000, max_weight_g: 2000, buffer_amount_usd: 6.8 },
  { country_code: "AE", min_weight_g: 2000, max_weight_g: 5000, buffer_amount_usd: 11 },
  { country_code: "AE", min_weight_g: 5000, max_weight_g: 100000, buffer_amount_usd: 18 },
  { country_code: "PH", min_weight_g: 0, max_weight_g: 250, buffer_amount_usd: 1.8 },
  { country_code: "PH", min_weight_g: 250, max_weight_g: 500, buffer_amount_usd: 2.6 },
  { country_code: "PH", min_weight_g: 500, max_weight_g: 1000, buffer_amount_usd: 3.9 },
  { country_code: "PH", min_weight_g: 1000, max_weight_g: 2000, buffer_amount_usd: 5.8 },
  { country_code: "PH", min_weight_g: 2000, max_weight_g: 5000, buffer_amount_usd: 9.5 },
  { country_code: "PH", min_weight_g: 5000, max_weight_g: 100000, buffer_amount_usd: 15 },
  { country_code: "MM", min_weight_g: 0, max_weight_g: 250, buffer_amount_usd: 1.5 },
  { country_code: "MM", min_weight_g: 250, max_weight_g: 500, buffer_amount_usd: 2.2 },
  { country_code: "MM", min_weight_g: 500, max_weight_g: 1000, buffer_amount_usd: 3.4 },
  { country_code: "MM", min_weight_g: 1000, max_weight_g: 2000, buffer_amount_usd: 5.2 },
  { country_code: "MM", min_weight_g: 2000, max_weight_g: 5000, buffer_amount_usd: 8.5 },
  { country_code: "MM", min_weight_g: 5000, max_weight_g: 100000, buffer_amount_usd: 14 },
];

export function isBufferedShippingMarket(
  countryCode: string | null | undefined,
): countryCode is BufferedShippingMarket {
  const code = normalizeCountryCode(countryCode);
  return (BUFFERED_SHIPPING_MARKETS as readonly string[]).includes(code);
}

export function targetMarketForCountry(
  countryCode: string | null | undefined,
): TargetMarket {
  const code = normalizeCountryCode(countryCode);
  return isBufferedShippingMarket(code) ? code : "GLOBAL";
}

export function displayCurrencyForMarket(
  market: TargetMarket | string,
): BuyerDisplayCurrency {
  switch (String(market).toUpperCase()) {
    case "AE":
      return "AED";
    case "PH":
      return "PHP";
    case "MM":
      return "USD";
    default:
      return "USDT";
  }
}

export function shippingTypeForMarket(market: TargetMarket): ShippingType {
  return market === "GLOBAL" ? "plus_shipping" : "included";
}

export function convertUsdtToDisplay(
  amountUsdt: number,
  currency: BuyerDisplayCurrency,
): number {
  const rate = DISPLAY_FX_FROM_USDT[currency] ?? 1;
  const value = Number(amountUsdt) * rate;
  if (currency === "PHP") {
    return Math.round(value);
  }
  return Math.round(value * 100) / 100;
}

export function lookupBufferFromRows(
  rows: ShippingBufferRow[],
  countryCode: string,
  weightGrams: number | null | undefined,
): number {
  const code = normalizeCountryCode(countryCode);
  if (!isBufferedShippingMarket(code)) return 0;
  const grams =
    weightGrams != null && Number.isFinite(weightGrams) && weightGrams > 0
      ? weightGrams
      : 300;
  const match = rows.find(
    (row) =>
      row.country_code === code &&
      grams >= row.min_weight_g &&
      grams < row.max_weight_g,
  );
  if (match) return Math.round(Number(match.buffer_amount_usd) * 100) / 100;
  const last = [...rows]
    .filter((row) => row.country_code === code)
    .sort((a, b) => b.max_weight_g - a.max_weight_g)[0];
  return last ? Math.round(Number(last.buffer_amount_usd) * 100) / 100 : 0;
}

let cachedBuffers: { at: number; rows: ShippingBufferRow[] } | null = null;
const CACHE_MS = 60_000;

export async function listShippingBuffers(): Promise<ShippingBufferRow[]> {
  if (cachedBuffers && Date.now() - cachedBuffers.at < CACHE_MS) {
    return cachedBuffers.rows;
  }
  if (!getSupabasePublicEnv()) {
    cachedBuffers = { at: Date.now(), rows: FALLBACK_SHIPPING_BUFFERS };
    return FALLBACK_SHIPPING_BUFFERS;
  }
  try {
    const supabase = await createClient();
    // Table added in migration 074 — may be missing from generated Database types.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("shipping_buffers")
      .select("country_code, min_weight_g, max_weight_g, buffer_amount_usd")
      .order("country_code", { ascending: true })
      .order("min_weight_g", { ascending: true });
    if (error || !data?.length) {
      cachedBuffers = { at: Date.now(), rows: FALLBACK_SHIPPING_BUFFERS };
      return FALLBACK_SHIPPING_BUFFERS;
    }
    const rows = (data as ShippingBufferRow[]).map((row) => ({
      country_code: String(row.country_code).toUpperCase(),
      min_weight_g: Number(row.min_weight_g),
      max_weight_g: Number(row.max_weight_g),
      buffer_amount_usd: Number(row.buffer_amount_usd),
    }));
    cachedBuffers = { at: Date.now(), rows };
    return rows;
  } catch {
    cachedBuffers = { at: Date.now(), rows: FALLBACK_SHIPPING_BUFFERS };
    return FALLBACK_SHIPPING_BUFFERS;
  }
}

export async function lookupShippingBufferUsd(
  countryCode: string,
  weightGrams?: number | null,
): Promise<number> {
  const rows = await listShippingBuffers();
  return lookupBufferFromRows(rows, countryCode, weightGrams);
}

export type RegionProductPrice = {
  countryCode: string;
  targetMarket: TargetMarket;
  shippingType: ShippingType;
  freeShipping: boolean;
  /** Settlement / cart amount in USDT (base + buffer when included). */
  priceUsdt: number;
  bufferUsdt: number;
  basePriceUsdt: number;
  displayCurrency: BuyerDisplayCurrency;
  displayAmount: number;
  shippingLabel: "Free Shipping" | "Plus Shipping Fee";
};

/**
 * Buyer-facing product price for a destination country.
 * `basePriceUsdt` is the stored listing price (cost × markup, no buffer).
 */
export function priceForBuyerCountry(args: {
  basePriceUsdt: number;
  countryCode: string | null | undefined;
  weightGrams?: number | null;
  buffers?: ShippingBufferRow[];
}): RegionProductPrice {
  const countryCode = normalizeCountryCode(args.countryCode);
  const targetMarket = targetMarketForCountry(countryCode);
  const shippingType = shippingTypeForMarket(targetMarket);
  const base = Number.isFinite(args.basePriceUsdt)
    ? Math.max(0, args.basePriceUsdt)
    : 0;
  const buffers = args.buffers ?? FALLBACK_SHIPPING_BUFFERS;
  const bufferUsdt =
    shippingType === "included"
      ? lookupBufferFromRows(buffers, countryCode, args.weightGrams)
      : 0;
  const priceUsdt = Math.round((base + bufferUsdt) * 100) / 100;
  const displayCurrency = displayCurrencyForMarket(targetMarket);
  return {
    countryCode,
    targetMarket,
    shippingType,
    freeShipping: shippingType === "included",
    priceUsdt,
    bufferUsdt,
    basePriceUsdt: base,
    displayCurrency,
    displayAmount: convertUsdtToDisplay(priceUsdt, displayCurrency),
    shippingLabel:
      shippingType === "included" ? "Free Shipping" : "Plus Shipping Fee",
  };
}

export async function priceForBuyerCountryAsync(args: {
  basePriceUsdt: number;
  countryCode: string | null | undefined;
  weightGrams?: number | null;
}): Promise<RegionProductPrice> {
  const buffers = await listShippingBuffers();
  return priceForBuyerCountry({ ...args, buffers });
}

/** Parse weight grams from product weight_grams or specifications. */
export function weightGramsFromProduct(product: {
  weight_grams?: number | null;
  weightGrams?: number | null;
  specifications?: Array<{ key: string; value: string }> | null;
}): number | null {
  const direct = product.weight_grams ?? product.weightGrams;
  if (direct != null && Number.isFinite(Number(direct)) && Number(direct) > 0) {
    return Number(direct);
  }
  for (const spec of product.specifications ?? []) {
    const key = spec.key.toLowerCase();
    if (
      key.includes("packing weight") ||
      key === "weight" ||
      key.includes("product weight")
    ) {
      const text = String(spec.value).trim().toLowerCase();
      const kg = text.match(/^([\d.]+)\s*kg$/);
      if (kg) {
        const n = Number(kg[1]);
        if (Number.isFinite(n) && n > 0) return n * 1000;
      }
      const g = text.match(/^([\d.]+)\s*g/);
      if (g) {
        const n = Number(g[1]);
        if (Number.isFinite(n) && n > 0) return n;
      }
    }
  }
  return null;
}
