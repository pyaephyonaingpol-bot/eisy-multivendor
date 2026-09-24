"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  BUYER_COUNTRY_COOKIE,
  BUYER_REGION_COOKIE,
  matchRegionCodeForCountry,
  normalizeCountryCode,
  sanitizeSourcingRegionId,
} from "@/lib/sourcing/constants";
import { listSourcingRegions } from "@/lib/sourcing/queries";

export type SourcingPreferenceState = {
  error?: string;
  success?: string;
  countryCode?: string;
  regionCode?: string;
} | null;

export type SupplierRouteFormState = {
  error?: string;
  success?: string;
} | null;

async function writeBuyerCookies(countryCode: string, regionCode: string) {
  const cookieStore = await cookies();
  const common = {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax" as const,
  };
  cookieStore.set(BUYER_COUNTRY_COOKIE, countryCode, common);
  cookieStore.set(BUYER_REGION_COOKIE, regionCode, common);
}

export async function setBuyerSourcingPreference(
  countryCodeInput: string,
  regionCodeInput?: string | null,
): Promise<{ countryCode: string; regionCode: string; error?: string }> {
  const countryCode = normalizeCountryCode(countryCodeInput);
  const regions = await listSourcingRegions();
  const regionCode =
    regionCodeInput && regions.some((region) => region.code === regionCodeInput)
      ? regionCodeInput
      : matchRegionCodeForCountry(countryCode, regions);

  await writeBuyerCookies(countryCode, regionCode);

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      await supabase.rpc("set_preferred_sourcing_region", {
        p_country_code: countryCode,
        p_region_code: regionCode,
      });
    }
  } catch {
    // Cookie preference still applies for guests / offline RPC.
  }

  revalidatePath("/", "layout");
  return { countryCode, regionCode };
}

export async function setBuyerSourcingPreferenceAction(
  _prev: SourcingPreferenceState,
  formData: FormData,
): Promise<SourcingPreferenceState> {
  const countryCode = String(formData.get("country_code") ?? "").trim();
  const regionCode = String(formData.get("region_code") ?? "").trim() || null;

  if (!countryCode) {
    return { error: "Choose a destination country." };
  }

  const result = await setBuyerSourcingPreference(countryCode, regionCode);
  if (result.error) {
    return { error: result.error };
  }

  return {
    success: "Shipping region updated.",
    countryCode: result.countryCode,
    regionCode: result.regionCode,
  };
}

export async function upsertProductSupplierRouteAction(
  _prev: SupplierRouteFormState,
  formData: FormData,
): Promise<SupplierRouteFormState> {
  const productId = String(formData.get("product_id") ?? "").trim();
  const regionIdRaw = String(formData.get("region_id") ?? "").trim();
  const regionId = sanitizeSourcingRegionId(regionIdRaw);
  const providerId = String(formData.get("provider_id") ?? "").trim();
  const warehouseCountry = normalizeCountryCode(
    String(formData.get("warehouse_country") ?? "CN"),
  );
  const externalSku = String(formData.get("external_sku") ?? "").trim() || null;
  const shippingCost = Number(formData.get("shipping_cost_usdt") ?? 0);
  const priority = Number(formData.get("priority") ?? 100);
  const daysMinRaw = String(formData.get("shipping_days_min") ?? "").trim();
  const daysMaxRaw = String(formData.get("shipping_days_max") ?? "").trim();
  const isActive = String(formData.get("is_active") ?? "true") === "true";
  const routeId = String(formData.get("route_id") ?? "").trim() || null;

  if (!productId || !regionId || !providerId) {
    return {
      error: regionIdRaw && !regionId
        ? "Choose a saved sourcing region (offline placeholders cannot be stored)."
        : "Region and provider are required.",
    };
  }

  if (!Number.isFinite(shippingCost) || shippingCost < 0) {
    return { error: "Shipping cost must be zero or greater (USDT)." };
  }

  const shippingDaysMin =
    daysMinRaw === "" ? null : Math.max(0, Math.floor(Number(daysMinRaw)));
  const shippingDaysMax =
    daysMaxRaw === "" ? null : Math.max(0, Math.floor(Number(daysMaxRaw)));

  if (
    shippingDaysMin != null &&
    shippingDaysMax != null &&
    shippingDaysMax < shippingDaysMin
  ) {
    return { error: "Max shipping days must be ≥ min days." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Sign in as the product owner to manage routes." };
  }

  const payload = {
    product_id: productId,
    region_id: regionId,
    provider_id: providerId,
    warehouse_country: warehouseCountry,
    external_sku: externalSku,
    shipping_cost_usdt: Math.round(shippingCost * 100) / 100,
    priority: Number.isFinite(priority) ? Math.floor(priority) : 100,
    shipping_days_min: shippingDaysMin,
    shipping_days_max: shippingDaysMax,
    is_active: isActive,
  };

  const query = routeId
    ? supabase.from("product_supplier_routes").update(payload).eq("id", routeId)
    : supabase.from("product_supplier_routes").upsert(payload, {
        onConflict: "product_id,region_id,provider_id",
      });

  const { error } = await query;
  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/vendor/products/${productId}/edit`);
  revalidatePath(`/vendor/sourcing/${productId}`);
  revalidatePath(`/products/${productId}`);
  return { success: routeId ? "Route updated." : "Route saved." };
}

export async function deleteProductSupplierRouteAction(
  _prev: SupplierRouteFormState,
  formData: FormData,
): Promise<SupplierRouteFormState> {
  const routeId = String(formData.get("route_id") ?? "").trim();
  const productId = String(formData.get("product_id") ?? "").trim();

  if (!routeId) {
    return { error: "Missing route id." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("product_supplier_routes")
    .delete()
    .eq("id", routeId);

  if (error) {
    return { error: error.message };
  }

  if (productId) {
    revalidatePath(`/vendor/products/${productId}/edit`);
    revalidatePath(`/vendor/sourcing/${productId}`);
    revalidatePath(`/products/${productId}`);
  }

  return { success: "Route removed." };
}

export async function ensureRecommendedSupplierRoutesAction(
  _prev: SupplierRouteFormState,
  formData: FormData,
): Promise<SupplierRouteFormState> {
  const productId = String(formData.get("product_id") ?? "").trim();
  if (!productId) {
    return { error: "Missing product id." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ensure_recommended_supplier_routes", {
    p_product_id: productId,
  });

  if (error) {
    return { error: error.message };
  }

  const inserted = typeof data === "number" ? data : 0;
  revalidatePath(`/vendor/sourcing/${productId}`);
  revalidatePath(`/vendor/products/${productId}/edit`);
  revalidatePath(`/products/${productId}`);

  return {
    success:
      inserted > 0
        ? `Added ${inserted} recommended regional supplier route${inserted === 1 ? "" : "s"}.`
        : "Recommended routes already present.",
  };
}
