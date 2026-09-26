import { NextResponse } from "next/server";
import { canAccessVendor, getSessionProfile } from "@/lib/auth/session";
import { getVendorForOwner } from "@/lib/vendors/queries";
import { getExternalProduct, parseSupplierKind } from "@/lib/suppliers";
import { loadPlatformSupplierContext } from "@/lib/suppliers/platform-credentials";
import {
  estimateImportShippingBuffer,
  normalizeImportShippingCountry,
  sellPriceWithShippingBuffer,
} from "@/lib/suppliers/shipping-buffer";
import { ONE_CLICK_IMPORT_MARKUP } from "@/lib/suppliers/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/suppliers/shipping-buffer
 * Estimate shipping buffer for import pricing (CJ freight or weight brackets).
 *
 * Query: provider, id, country (ISO), variantId? (optional)
 */
export async function GET(request: Request) {
  const session = await getSessionProfile();
  if (!session || !canAccessVendor(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const vendor = await getVendorForOwner(session.userId);
  if (!vendor || vendor.status !== "approved") {
    return NextResponse.json(
      { error: "Approved vendor required." },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const provider = parseSupplierKind(
    url.searchParams.get("provider") ?? url.searchParams.get("kind") ?? "",
  );
  const id = (
    url.searchParams.get("id") ??
    url.searchParams.get("external_product_id") ??
    ""
  ).trim();
  const country = normalizeImportShippingCountry(
    url.searchParams.get("country") ?? url.searchParams.get("shipping_country"),
  );
  const variantId =
    (
      url.searchParams.get("variantId") ??
      url.searchParams.get("variant_id") ??
      url.searchParams.get("vid") ??
      ""
    ).trim() || null;
  const costParam = url.searchParams.get("cost");
  const costUsdt =
    costParam != null && costParam !== "" ? Number(costParam) : null;

  if (!provider || !id) {
    return NextResponse.json(
      { error: "provider and id are required" },
      { status: 400 },
    );
  }

  const linked = await loadPlatformSupplierContext(provider);
  const credentials = linked?.credentials ?? null;

  try {
    const product = await getExternalProduct(provider, id, credentials);
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const estimate = await estimateImportShippingBuffer({
      product,
      destinationCountry: country,
      credentials,
      variantId,
    });

    const supplierCost =
      costUsdt != null && Number.isFinite(costUsdt) && costUsdt > 0
        ? costUsdt
        : product.priceUsdt;

    const suggestedSellPrice = sellPriceWithShippingBuffer(
      supplierCost,
      estimate.bufferUsdt,
      ONE_CLICK_IMPORT_MARKUP,
    );

    return NextResponse.json({
      ok: true,
      estimate,
      supplierCostUsdt: supplierCost,
      markup: ONE_CLICK_IMPORT_MARKUP,
      suggestedSellPrice,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to estimate shipping buffer";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
