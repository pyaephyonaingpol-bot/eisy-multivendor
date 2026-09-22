import { NextResponse } from "next/server";
import { canAccessVendor, getSessionProfile } from "@/lib/auth/session";
import {
  listCjImportedProductsForVendor,
  listManualProductsForVendor,
  listProductsForVendor,
} from "@/lib/products/queries";
import type { ProductCatalogKind } from "@/lib/types/database";
import { getVendorForOwner } from "@/lib/vendors/queries";

export const dynamic = "force-dynamic";

/**
 * GET /api/vendor/products?catalog_kind=manual|cj_import
 *
 * Lists the vendor's products partitioned by catalog workflow so manual and
 * CJ Dropshipping imports never mix.
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
  const rawKind = String(searchParams.get("catalog_kind") ?? "").trim();
  const catalogKind: ProductCatalogKind | undefined =
    rawKind === "manual" || rawKind === "cj_import" ? rawKind : undefined;
  const page = Number(searchParams.get("page") ?? "1");
  const pageSize = Number(searchParams.get("page_size") ?? "50");

  const products = catalogKind
    ? catalogKind === "manual"
      ? await listManualProductsForVendor(vendor.id, { page, pageSize })
      : await listCjImportedProductsForVendor(vendor.id, { page, pageSize })
    : await listProductsForVendor(vendor.id, { page, pageSize });

  return NextResponse.json({
    catalog_kind: catalogKind ?? "all",
    count: products.length,
    products: products.map((product) => ({
      id: product.id,
      name: product.name,
      slug: product.slug,
      price: product.price,
      currency: product.currency,
      status: product.status,
      catalog_kind: product.catalog_kind,
      is_dropship: product.is_dropship,
      stock_quantity: product.stock_quantity,
      images: product.images,
      updated_at: product.updated_at,
    })),
  });
}
