import { createClient } from "@/lib/supabase/server";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { getSessionProfile } from "@/lib/auth/session";
import {
  DEFAULT_BUYER_COUNTRY,
  DEFAULT_BUYER_REGION,
  FALLBACK_REGIONS,
  isSourcingRegionUuid,
  matchRegionCodeForCountry,
  normalizeCountryCode,
  sanitizeSourcingRegionId,
} from "@/lib/sourcing/constants";
import type {
  ProductSupplierRoute,
  ResolvedSupplierRoute,
  SourcingRegion,
  SupplierProvider,
} from "@/lib/types/database";

export type BuyerSourcingContext = {
  countryCode: string;
  regionCode: string;
  regionName: string;
  region: SourcingRegion | null;
  /** True when country/region came from the signed-in profile. */
  fromProfile: boolean;
  isAuthenticated: boolean;
};

function fallbackRegion(code: string): SourcingRegion {
  const seed =
    FALLBACK_REGIONS.find((region) => region.code === code) ?? FALLBACK_REGIONS[0];
  return {
    // Offline-only placeholder: never invent `fallback-GLOBAL` (invalid uuid).
    // Callers must use sanitizeSourcingRegionId() before any DB write — empty
    // id means "no persisted region row".
    id: "",
    code: seed.code,
    name: seed.name,
    country_codes: seed.country_codes,
    is_default: seed.is_default,
    sort_order: 0,
    is_active: true,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
  };
}

export async function listSourcingRegions(): Promise<SourcingRegion[]> {
  if (!getSupabasePublicEnv()) {
    return FALLBACK_REGIONS.map((region) => fallbackRegion(region.code));
  }

  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("sourcing_regions")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    const rows = (data as SourcingRegion[] | null) ?? [];
    if (rows.length === 0) {
      return FALLBACK_REGIONS.map((region) => fallbackRegion(region.code));
    }
    return rows;
  } catch {
    return FALLBACK_REGIONS.map((region) => fallbackRegion(region.code));
  }
}

export async function listSupplierProviders(): Promise<SupplierProvider[]> {
  if (!getSupabasePublicEnv()) {
    return [];
  }

  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("supplier_providers")
      .select("*")
      .eq("is_active", true)
      .order("name", { ascending: true });
    return (data as SupplierProvider[] | null) ?? [];
  } catch {
    return [];
  }
}

/**
 * Resolve buyer shipping country/region for catalog filtering.
 *
 * Priority:
 * 1. Explicit `preferredCountry` override (e.g. checkout form)
 * 2. Signed-in buyer's default delivery address country
 * 3. Signed-in profile `preferred_country_code` / `preferred_region_id`
 * 4. Default region (GLOBAL) for guests
 */
export async function getBuyerSourcingContext(
  preferredCountry?: string | null,
): Promise<BuyerSourcingContext> {
  const hasExplicitCountry =
    preferredCountry !== undefined &&
    preferredCountry !== null &&
    String(preferredCountry).trim() !== "";

  const session = !hasExplicitCountry ? await getSessionProfile() : null;

  let defaultAddressCountry: string | null = null;
  if (session?.userId && !hasExplicitCountry) {
    try {
      const { getDefaultBuyerAddress } = await import(
        "@/lib/addresses/queries"
      );
      const defaultAddress = await getDefaultBuyerAddress(session.userId);
      defaultAddressCountry = defaultAddress?.country_code ?? null;
    } catch {
      defaultAddressCountry = null;
    }
  }

  const profileCountry = session?.profile?.preferred_country_code ?? null;
  const profileRegionId = session?.profile?.preferred_region_id ?? null;

  const countryCode = normalizeCountryCode(
    (hasExplicitCountry ? preferredCountry : null) ||
      defaultAddressCountry ||
      profileCountry ||
      DEFAULT_BUYER_COUNTRY,
  );

  const regions = await listSourcingRegions();

  let region: SourcingRegion | null = null;
  if (
    profileRegionId &&
    isSourcingRegionUuid(profileRegionId) &&
    !hasExplicitCountry &&
    !defaultAddressCountry
  ) {
    region = regions.find((row) => row.id === profileRegionId) ?? null;
  }
  if (!region) {
    const regionCode = matchRegionCodeForCountry(countryCode, regions);
    region =
      regions.find((row) => row.code === regionCode) ??
      regions.find((row) => row.is_default) ??
      regions[0] ??
      null;
  }

  const fromProfile = Boolean(
    !hasExplicitCountry &&
      session &&
      (defaultAddressCountry || profileCountry || profileRegionId),
  );

  return {
    countryCode,
    regionCode: region?.code ?? DEFAULT_BUYER_REGION,
    regionName: region?.name ?? "Rest of world",
    region,
    fromProfile,
    isAuthenticated: Boolean(session),
  };
}

export async function resolveProductSupplierRoute(
  productId: string,
  countryCode?: string | null,
): Promise<ResolvedSupplierRoute | null> {
  if (!productId || !getSupabasePublicEnv()) {
    return null;
  }

  const context = await getBuyerSourcingContext(countryCode);

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("resolve_product_supplier_route", {
      p_product_id: productId,
      p_country_code: context.countryCode,
    });

    if (error || !data) {
      return {
        product_id: productId,
        source_product_id: productId,
        // Never send offline placeholders like `fallback-GLOBAL` into uuid columns.
        region_id: sanitizeSourcingRegionId(context.region?.id) ?? "",
        region_code: context.regionCode,
        region_name: context.regionName,
        provider_id: null,
        provider_slug: "internal",
        provider_name: "EISY Internal Vendors",
        provider_kind: "internal",
        route_id: null,
        warehouse_country: "MM",
        shipping_days_min: 3,
        shipping_days_max: 10,
        shipping_cost_usdt: 0,
        external_sku: null,
      };
    }

    return data as ResolvedSupplierRoute;
  } catch {
    return null;
  }
}

export type ProductSupplierRouteRow = ProductSupplierRoute & {
  region: Pick<SourcingRegion, "id" | "code" | "name"> | null;
  provider: Pick<SupplierProvider, "id" | "slug" | "name" | "kind"> | null;
};

export async function listProductSupplierRoutes(
  productId: string,
): Promise<ProductSupplierRouteRow[]> {
  if (!productId || !getSupabasePublicEnv()) {
    return [];
  }

  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("product_supplier_routes")
      .select("*")
      .eq("product_id", productId)
      .order("priority", { ascending: true });

    const routes = (data as ProductSupplierRoute[] | null) ?? [];
    if (routes.length === 0) {
      return [];
    }

    const regionIds = [...new Set(routes.map((route) => route.region_id))];
    const providerIds = [...new Set(routes.map((route) => route.provider_id))];

    const [{ data: regionRows }, { data: providerRows }] = await Promise.all([
      supabase.from("sourcing_regions").select("id, code, name").in("id", regionIds),
      supabase
        .from("supplier_providers")
        .select("id, slug, name, kind")
        .in("id", providerIds),
    ]);

    const regionsById = new Map(
      ((regionRows as Pick<SourcingRegion, "id" | "code" | "name">[] | null) ?? []).map(
        (region) => [region.id, region],
      ),
    );
    const providersById = new Map(
      (
        (providerRows as Pick<
          SupplierProvider,
          "id" | "slug" | "name" | "kind"
        >[] | null) ?? []
      ).map((provider) => [provider.id, provider]),
    );

    return routes.map((route) => ({
      ...route,
      region: regionsById.get(route.region_id) ?? null,
      provider: providersById.get(route.provider_id) ?? null,
    }));
  } catch {
    return [];
  }
}
