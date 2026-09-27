import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import {
  FALLBACK_SHIPPING_BUFFERS,
  lookupBufferFromRows,
  priceForBuyerCountry,
  type RegionProductPrice,
  type ShippingBufferRow,
} from "@/lib/shipping/region-pricing";

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

export async function priceForBuyerCountryAsync(args: {
  basePriceUsdt: number;
  countryCode: string | null | undefined;
  weightGrams?: number | null;
}): Promise<RegionProductPrice> {
  const buffers = await listShippingBuffers();
  return priceForBuyerCountry({ ...args, buffers });
}
