import { NextResponse } from "next/server";
import { canAccessVendor, getSessionProfile } from "@/lib/auth/session";
import { listCjImportedProductsForVendor } from "@/lib/products/queries";
import { createClient } from "@/lib/supabase/server";
import { getVendorForOwner } from "@/lib/vendors/queries";

export const dynamic = "force-dynamic";

/**
 * GET /api/vendor/cj-products
 *
 * CJ Dropshipping import registry + product rows only (never manual catalog).
 */
export async function GET(request: Request) {
  const session = await getSessionProfile();
  if (!session || !canAccessVendor(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const vendor = await getVendorForOwner(session.userId);
  if (!vendor) {
    return NextResponse.json(
      { error: "Vendor profile required." },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(request.url);
  const page = Number(searchParams.get("page") ?? "1");
  const pageSize = Number(searchParams.get("page_size") ?? "50");

  const products = await listCjImportedProductsForVendor(vendor.id, {
    page,
    pageSize,
  });

  const supabase = await createClient();
  const { data: registry } = await supabase
    .from("cj_imported_products")
    .select(
      "id, product_id, external_product_id, external_variant_id, external_sku, supplier_cost_usdt, last_synced_at, created_at",
    )
    .eq("vendor_id", vendor.id);

  const registryByProductId = new Map(
    ((registry as Array<{ product_id: string }> | null) ?? []).map((row) => [
      row.product_id,
      row,
    ]),
  );

  return NextResponse.json({
    catalog_kind: "cj_import",
    count: products.length,
    products: products.map((product) => ({
      id: product.id,
      name: product.name,
      slug: product.slug,
      price: product.price,
      currency: product.currency,
      status: product.status,
      catalog_kind: "cj_import" as const,
      stock_quantity: product.stock_quantity,
      images: product.images,
      import: registryByProductId.get(product.id) ?? null,
      updated_at: product.updated_at,
    })),
  });
}
