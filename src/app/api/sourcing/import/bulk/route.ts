import {
  bulkImportExternalSupplierProductsAction,
  MAX_BULK_IMPORT_ITEMS,
} from "@/lib/suppliers/actions";
import { jsonError, jsonOk, statusFromMessage } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BulkImportBody = {
  items?: Array<{
    provider_kind?: string;
    providerKind?: string;
    external_product_id?: string;
    externalProductId?: string;
  }>;
  region_code?: string;
  include_compare_price?: boolean;
};

/**
 * POST /api/sourcing/import/bulk
 * One-click import of multiple supplier catalog products.
 */
export async function POST(request: Request) {
  let body: BulkImportBody;
  try {
    body = (await request.json()) as BulkImportBody;
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  const items = (body.items ?? [])
    .map((item) => ({
      providerKind: String(item.providerKind ?? item.provider_kind ?? ""),
      externalProductId: String(
        item.externalProductId ?? item.external_product_id ?? "",
      ),
    }))
    .filter((item) => item.providerKind && item.externalProductId);

  if (items.length === 0) {
    return jsonError("Select at least one supplier product to import.", 400);
  }

  if (items.length > MAX_BULK_IMPORT_ITEMS) {
    return jsonError(
      `Bulk import supports up to ${MAX_BULK_IMPORT_ITEMS} products at a time.`,
      400,
    );
  }

  const result = await bulkImportExternalSupplierProductsAction({
    items,
    regionCode: body.region_code,
    includeComparePrice: Boolean(body.include_compare_price),
  });

  if (result.error && result.imported === 0) {
    return jsonError(
      result.error,
      statusFromMessage(result.error) || 400,
    );
  }

  return jsonOk({
    success: result.success,
    imported: result.imported,
    failed: result.failed,
    productIds: result.productIds,
    max_per_request: MAX_BULK_IMPORT_ITEMS,
  });
}
