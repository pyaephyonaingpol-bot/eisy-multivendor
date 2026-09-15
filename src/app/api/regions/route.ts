import {
  listProductsForBuyerLocation,
  listRegions,
  setRegionPreference,
  updateVendorShippingRegionsApi,
} from "@/lib/api/regions-controller";
import { jsonError, jsonOk, statusFromMessage } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/regions
 * List sourcing regions + current buyer location context.
 *
 * Optional: ?products=1&country=MM&q=...&limit=24 to also return
 * products filtered by buyer location / vendor shipping regions.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const includeProducts =
    searchParams.get("products") === "1" ||
    searchParams.get("include_products") === "1";

  const regionsResult = await listRegions();
  if (!regionsResult.ok) {
    return jsonError(regionsResult.error, regionsResult.status);
  }

  if (!includeProducts) {
    return jsonOk(regionsResult.data);
  }

  const productsResult = await listProductsForBuyerLocation({
    country: searchParams.get("country"),
    region: searchParams.get("region"),
    limit: Number(searchParams.get("limit") ?? "24") || 24,
    q: searchParams.get("q") ?? searchParams.get("query"),
  });

  if (!productsResult.ok) {
    return jsonError(productsResult.error, productsResult.status);
  }

  return jsonOk({
    ...regionsResult.data,
    catalog: productsResult.data,
  });
}

/**
 * POST /api/regions
 * - Buyer preference: { country_code, region_code? }
 * - Vendor shipping regions: { ships_to_region_ids: uuid[] }
 */
export async function POST(request: Request) {
  let body: {
    country_code?: string;
    region_code?: string | null;
    ships_to_region_ids?: string[];
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  if (Array.isArray(body.ships_to_region_ids)) {
    const result = await updateVendorShippingRegionsApi({
      ships_to_region_ids: body.ships_to_region_ids,
    });
    if (!result.ok) {
      return jsonError(
        result.error,
        statusFromMessage(result.error) || result.status,
      );
    }
    return jsonOk(result.data);
  }

  const result = await setRegionPreference({
    country_code: body.country_code,
    region_code: body.region_code,
  });
  if (!result.ok) {
    return jsonError(result.error, result.status);
  }
  return jsonOk(result.data);
}
