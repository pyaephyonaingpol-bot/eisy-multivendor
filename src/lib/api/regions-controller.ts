import { revalidatePath } from "next/cache";
import { canAccessVendor, getSessionProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  listPublicProductsForCountry,
  type PublicProductSummary,
} from "@/lib/products/queries";
import { setBuyerSourcingPreference } from "@/lib/sourcing/actions";
import {
  DEFAULT_BUYER_COUNTRY,
  matchRegionCodeForCountry,
  normalizeCountryCode,
} from "@/lib/sourcing/constants";
import {
  getBuyerSourcingContext,
  listSourcingRegions,
} from "@/lib/sourcing/queries";
import { getVendorForOwner } from "@/lib/vendors/queries";

export type RegionsControllerResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number };

export async function listRegions(): Promise<
  RegionsControllerResult<{
    regions: Awaited<ReturnType<typeof listSourcingRegions>>;
    buyer: Awaited<ReturnType<typeof getBuyerSourcingContext>>;
  }>
> {
  const [regions, buyer] = await Promise.all([
    listSourcingRegions(),
    getBuyerSourcingContext(),
  ]);
  return { ok: true, data: { regions, buyer } };
}

export async function setRegionPreference(input: {
  country_code?: string;
  region_code?: string | null;
}): Promise<
  RegionsControllerResult<{ countryCode: string; regionCode: string }>
> {
  const countryCode = String(input.country_code ?? "").trim();
  if (!countryCode) {
    return {
      ok: false,
      error: "country_code is required.",
      status: 400,
    };
  }

  const result = await setBuyerSourcingPreference(
    countryCode,
    input.region_code ?? null,
  );
  if (result.error) {
    return { ok: false, error: result.error, status: 400 };
  }

  return {
    ok: true,
    data: {
      countryCode: result.countryCode,
      regionCode: result.regionCode,
    },
  };
}

export async function listProductsForBuyerLocation(input: {
  country?: string | null;
  region?: string | null;
  limit?: number | null;
  q?: string | null;
}): Promise<
  RegionsControllerResult<{
    country: string;
    region: string;
    count: number;
    products: PublicProductSummary[];
  }>
> {
  const buyer = await getBuyerSourcingContext();
  const regions = await listSourcingRegions();
  const country = input.country
    ? normalizeCountryCode(input.country)
    : buyer.countryCode || DEFAULT_BUYER_COUNTRY;
  const region =
    input.region && regions.some((row) => row.code === input.region)
      ? input.region
      : matchRegionCodeForCountry(country, regions);

  const limit = Math.min(Math.max(Number(input.limit ?? 24) || 24, 1), 100);
  let products = await listPublicProductsForCountry(country, limit);

  const q = String(input.q ?? "")
    .trim()
    .toLowerCase();
  if (q) {
    products = products.filter(
      (product) =>
        product.name.toLowerCase().includes(q) ||
        (product.description ?? "").toLowerCase().includes(q),
    );
  }

  return {
    ok: true,
    data: {
      country,
      region,
      count: products.length,
      products,
    },
  };
}

export async function updateVendorShippingRegionsApi(input: {
  ships_to_region_ids?: string[];
}): Promise<
  RegionsControllerResult<{
    vendor_id: string;
    ships_to_region_ids: string[];
  }>
> {
  const session = await getSessionProfile();
  if (!session || !canAccessVendor(session.role)) {
    return { ok: false, error: "Sign in as a vendor.", status: 401 };
  }

  const vendor = await getVendorForOwner(session.userId);
  if (!vendor) {
    return {
      ok: false,
      error: "Create a store application before editing shipping regions.",
      status: 404,
    };
  }

  const regionIds = (input.ships_to_region_ids ?? [])
    .map((value) => String(value).trim())
    .filter((value) => /^[0-9a-f-]{36}$/i.test(value));

  const supabase = await createClient();
  let shipsToRegionIds = regionIds;

  if (regionIds.length > 0) {
    const { data: validRows, error: regionsError } = await supabase
      .from("sourcing_regions")
      .select("id")
      .eq("is_active", true)
      .in("id", regionIds);

    if (regionsError) {
      return { ok: false, error: regionsError.message, status: 400 };
    }

    const valid = new Set(
      ((validRows as { id: string }[] | null) ?? []).map((row) => row.id),
    );
    shipsToRegionIds = regionIds.filter((id) => valid.has(id));
  }

  const { error } = await supabase
    .from("vendors")
    .update({
      ships_to_region_ids: shipsToRegionIds,
      updated_at: new Date().toISOString(),
    })
    .eq("id", vendor.id)
    .eq("owner_id", session.userId);

  if (error) {
    return { ok: false, error: error.message, status: 400 };
  }

  revalidatePath("/vendor/settings");
  revalidatePath("/products");
  revalidatePath("/");

  return {
    ok: true,
    data: {
      vendor_id: vendor.id,
      ships_to_region_ids: shipsToRegionIds,
    },
  };
}
