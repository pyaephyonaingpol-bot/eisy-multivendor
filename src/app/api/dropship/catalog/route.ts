import { NextResponse } from "next/server";
import { getSessionProfile, canAccessVendor } from "@/lib/auth/session";
import { listImportableCatalogProducts } from "@/lib/dropship/queries";
import { getVendorForOwner } from "@/lib/vendors/queries";

export const dynamic = "force-dynamic";

/**
 * Browser-extension friendly catalog of **independent marketplace** products
 * that may be resold. Does not include CJ Dropshipping catalog items —
 * use /api/suppliers/catalog and /api/sourcing/import/bulk for CJ.
 */
export async function GET(request: Request) {
  const session = await getSessionProfile();
  if (!session || !canAccessVendor(session.role)) {
    return NextResponse.json(
      { ok: false, error: "Sign in as a vendor to browse the import catalog." },
      { status: 401 },
    );
  }

  const vendor = await getVendorForOwner(session.userId);
  if (!vendor || vendor.status !== "approved") {
    return NextResponse.json(
      { ok: false, error: "Approved vendor profile required." },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(request.url);
  const limitRaw = Number(searchParams.get("limit") ?? "24");
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(Math.floor(limitRaw), 1), 100)
    : 24;

  const products = await listImportableCatalogProducts(vendor.id, limit);

  return NextResponse.json({
    ok: true,
    catalog: "marketplace_reseller",
    note:
      "Independent vendor products only. CJ Dropshipping bulk import uses /api/suppliers/catalog + /api/sourcing/import/bulk.",
    products: products.map((product) => ({
      id: product.id,
      name: product.name,
      slug: product.slug,
      price: Number(product.price),
      currency: product.currency,
      sku: product.sku,
      product_type: product.product_type,
      stock_quantity: product.stock_quantity,
      images: product.images,
      catalog_kind: product.catalog_kind ?? "manual",
      vendor: product.vendor,
      product_url: `/products/${product.id}`,
      import_hint: {
        endpoint: "/api/dropship/import",
        method: "POST",
        body: {
          source_product_id: product.id,
          price: Math.round(Number(product.price) * 1.15 * 100) / 100,
          status: "active",
        },
      },
    })),
  });
}
