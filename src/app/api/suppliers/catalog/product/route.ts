import { NextResponse } from "next/server";
import { canAccessVendor, getSessionProfile } from "@/lib/auth/session";
import { getVendorForOwner } from "@/lib/vendors/queries";
import { getExternalProduct, parseSupplierKind } from "@/lib/suppliers";
import {
  hasLiveSupplierCredentials,
  loadPlatformSupplierContext,
} from "@/lib/suppliers/auth";
import {
  supplierIntegrationsMode,
  supplierPlatformLabel,
} from "@/lib/suppliers/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/suppliers/catalog/product?provider=…&id=…
 * Full product detail for the preview modal (images, variants, description).
 * Uses platform-owned supplier API keys — vendors do not connect their own.
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

  if (!provider || !id) {
    return NextResponse.json(
      { error: "provider and id are required" },
      { status: 400 },
    );
  }

  const linked = await loadPlatformSupplierContext(provider);
  const credentials = linked?.credentials ?? null;
  const platformConnected = hasLiveSupplierCredentials(
    provider,
    null,
    credentials,
  );

  const mode = supplierIntegrationsMode();
  if (mode === "live" && !platformConnected) {
    return NextResponse.json(
      {
        error: `${supplierPlatformLabel(provider)} is not configured on the platform yet. Ask an admin to add API keys under Admin → Supplier APIs (or set env keys).`,
      },
      { status: 400 },
    );
  }

  try {
    const product = await getExternalProduct(provider, id, credentials);
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      product,
      mode,
      hasCredentials: platformConnected,
      platformManaged: true,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load product";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
