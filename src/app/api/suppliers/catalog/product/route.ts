import { NextResponse } from "next/server";
import { canAccessVendor, getSessionProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getVendorForOwner } from "@/lib/vendors/queries";
import { getExternalProduct, parseSupplierKind } from "@/lib/suppliers";
import { supplierIntegrationsMode } from "@/lib/suppliers/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/suppliers/catalog/product?provider=cj_dropshipping|dsers&id=...
 * Full product detail for the preview modal (images, variants, description).
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
  const id = (url.searchParams.get("id") ?? url.searchParams.get("external_product_id") ?? "").trim();

  if (!provider || !id) {
    return NextResponse.json(
      { error: "provider and id are required" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data: providerRow } = await supabase
    .from("supplier_providers")
    .select("id")
    .eq("kind", provider)
    .eq("is_active", true)
    .maybeSingle();

  let credentials = null;
  let hasCredentials = false;
  if (providerRow?.id) {
    const { data: creds } = await supabase
      .from("vendor_supplier_credentials")
      .select(
        "api_key, api_secret, access_token, refresh_token, account_email, metadata",
      )
      .eq("vendor_id", vendor.id)
      .eq("provider_id", providerRow.id)
      .eq("is_active", true)
      .maybeSingle();
    if (creds) {
      hasCredentials = true;
      credentials = {
        apiKey: creds.api_key,
        apiSecret: creds.api_secret,
        accessToken: creds.access_token,
        refreshToken: creds.refresh_token,
        accountEmail: creds.account_email,
        metadata: (creds.metadata ?? {}) as Record<string, unknown>,
      };
    }
  }

  const mode = supplierIntegrationsMode();
  if (mode === "live" && !hasCredentials) {
    return NextResponse.json(
      {
        error: `Connect ${provider === "cj_dropshipping" ? "CJ" : "DSers"} credentials before previewing products in live mode.`,
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
      hasCredentials,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load product";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
