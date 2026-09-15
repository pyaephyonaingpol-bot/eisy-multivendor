import { NextResponse } from "next/server";
import { getSessionProfile, canAccessVendor } from "@/lib/auth/session";
import {
  parseSupplierKind,
  searchExternalProducts,
} from "@/lib/suppliers";
import { supplierIntegrationsMode } from "@/lib/suppliers/types";
import { createClient } from "@/lib/supabase/server";
import { getVendorForOwner } from "@/lib/vendors/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const { searchParams } = new URL(request.url);
  const kind = parseSupplierKind(searchParams.get("provider") ?? searchParams.get("kind"));
  const query = String(searchParams.get("q") ?? searchParams.get("query") ?? "").trim();
  const page = Number(searchParams.get("page") ?? "1") || 1;

  if (!kind) {
    return NextResponse.json(
      { error: "provider must be cj_dropshipping or dsers." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data: provider } = await supabase
    .from("supplier_providers")
    .select("id")
    .eq("kind", kind)
    .eq("is_active", true)
    .maybeSingle();

  let credentials = null;
  if (provider) {
    const { data: creds } = await supabase
      .from("vendor_supplier_credentials")
      .select("api_key, api_secret, access_token, refresh_token, account_email, metadata")
      .eq("vendor_id", vendor.id)
      .eq("provider_id", provider.id)
      .eq("is_active", true)
      .maybeSingle();
    if (creds) {
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

  try {
    const products = await searchExternalProducts(
      kind,
      query,
      credentials,
      page,
    );
    return NextResponse.json({
      ok: true,
      provider: kind,
      query,
      count: products.length,
      mode: supplierIntegrationsMode(),
      products,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Search failed.",
      },
      { status: 500 },
    );
  }
}
