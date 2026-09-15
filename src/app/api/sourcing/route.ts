import { searchSourcingCatalog } from "@/lib/api/sourcing-controller";
import { jsonError, jsonOk } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/sourcing
 * Fetch/filter external catalog by source (DSers/CJ/Spocket/POD) and delivery speed.
 *
 * Query: source|tab|provider, q, region, page, delivery_speed|speed (any|fast|local|standard|economy)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const result = await searchSourcingCatalog({
    source:
      searchParams.get("source") ??
      searchParams.get("tab") ??
      searchParams.get("provider") ??
      searchParams.get("kind"),
    query: searchParams.get("q") ?? searchParams.get("query"),
    region: searchParams.get("region") ?? searchParams.get("region_code"),
    page: Number(searchParams.get("page") ?? "1") || 1,
    deliverySpeed:
      searchParams.get("delivery_speed") ??
      searchParams.get("speed") ??
      searchParams.get("shipping_speed"),
  });

  if (!result.ok) {
    return jsonError(result.error, result.status);
  }
  return jsonOk(result.data);
}
