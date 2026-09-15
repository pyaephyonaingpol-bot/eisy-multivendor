import { listProductsForBuyerLocation } from "@/lib/api/regions-controller";
import { jsonError, jsonOk } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/regions/products
 * Products filtered by buyer country / vendor shipping regions.
 *
 * Query: country, region, q, limit
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const result = await listProductsForBuyerLocation({
    country: searchParams.get("country"),
    region: searchParams.get("region"),
    limit: Number(searchParams.get("limit") ?? "24") || 24,
    q: searchParams.get("q") ?? searchParams.get("query"),
  });

  if (!result.ok) {
    return jsonError(result.error, result.status);
  }
  return jsonOk(result.data);
}
