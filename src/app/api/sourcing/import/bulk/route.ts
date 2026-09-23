import { bulkImportExternalSupplierProductsAction } from "@/lib/suppliers/actions";
import { jsonError, jsonOk, statusFromMessage } from "@/lib/api/http";
import { MAX_BULK_IMPORT_ITEMS } from "@/lib/suppliers/types";

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
 * One-click bulk import from the CJ Dropshipping catalog only.
 * Marketplace / independent vendor product IDs are rejected.
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
    return jsonError(
      "Select at least one CJ Dropshipping catalog product to import.",
      400,
    );
  }

  const nonCj = items.filter((item) => {
    const kind = item.providerKind.toLowerCase();
    return kind !== "cj_dropshipping" && kind !== "cj" && !kind.includes("cj_drop");
  });
  if (nonCj.length > 0) {
    return jsonError(
      "Bulk import only accepts CJ Dropshipping catalog items. Use /vendor/import/marketplace for independent vendor products.",
      400,
    );
  }

  if (items.length > MAX_BULK_IMPORT_ITEMS) {
    return jsonError(
      `Bulk import supports up to ${MAX_BULK_IMPORT_ITEMS} products at a time.`,
      400,
    );
  }

  const result = await bulkImportExternalSupplierProductsAction({
    items: items.map((item) => ({
      providerKind: "cj_dropshipping",
      externalProductId: item.externalProductId,
    })),
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
    catalog_kind: "cj_import",
    provider: "cj_dropshipping",
    max_per_request: MAX_BULK_IMPORT_ITEMS,
  });
}
