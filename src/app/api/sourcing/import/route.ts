import { importSourcingProduct } from "@/lib/api/sourcing-controller";
import { jsonError, jsonOk, statusFromMessage } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ImportBody = {
  provider_kind?: string;
  provider?: string;
  external_product_id?: string;
  region_code?: string;
  price?: number | string;
  name?: string;
  description?: string;
  external_variant_id?: string;
  external_sku?: string;
  one_click?: boolean;
};

/**
 * POST /api/sourcing/import
 * Import an external supplier product into the vendor catalog.
 */
export async function POST(request: Request) {
  let body: ImportBody;
  try {
    body = (await request.json()) as ImportBody;
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  const result = await importSourcingProduct({
    provider_kind: body.provider_kind ?? body.provider,
    external_product_id: body.external_product_id,
    region_code: body.region_code,
    price: body.price,
    name: body.name,
    description: body.description,
    external_variant_id: body.external_variant_id,
    external_sku: body.external_sku,
    one_click: Boolean(body.one_click),
  });

  if (!result.ok) {
    return jsonError(result.error, statusFromMessage(result.error) || result.status);
  }

  return jsonOk(result.data);
}
