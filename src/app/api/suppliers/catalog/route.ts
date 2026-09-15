import { NextResponse } from "next/server";
import { getSessionProfile, canAccessVendor } from "@/lib/auth/session";
import {
  kindsForSourceTab,
  parseSourceTab,
  parseSupplierKind,
  searchExternalProducts,
  searchExternalProductsForTab,
} from "@/lib/suppliers";
import {
  SUPPLIER_PROVIDER_SLUGS,
  type ExternalSupplierKind,
  type SupplierCredentials,
} from "@/lib/suppliers/types";
import { createClient } from "@/lib/supabase/server";
import { getVendorForOwner } from "@/lib/vendors/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadCredentialsForKind(
  vendorId: string,
  kind: ExternalSupplierKind,
): Promise<SupplierCredentials | null> {
  const supabase = await createClient();
  const slug = SUPPLIER_PROVIDER_SLUGS[kind];
  const { data: provider } = await supabase
    .from("supplier_providers")
    .select("id")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (!provider) return null;

  const { data: creds } = await supabase
    .from("vendor_supplier_credentials")
    .select(
      "api_key, api_secret, access_token, refresh_token, account_email, metadata",
    )
    .eq("vendor_id", vendorId)
    .eq("provider_id", provider.id)
    .eq("is_active", true)
    .maybeSingle();

  if (!creds) return null;

  return {
    apiKey: creds.api_key,
    apiSecret: creds.api_secret,
    accessToken: creds.access_token,
    refreshToken: creds.refresh_token,
    accountEmail: creds.account_email,
    metadata: (creds.metadata ?? {}) as Record<string, unknown>,
  };
}

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
  const sourceRaw =
    searchParams.get("source") ??
    searchParams.get("tab") ??
    searchParams.get("provider") ??
    searchParams.get("kind");
  const query = String(
    searchParams.get("q") ?? searchParams.get("query") ?? "",
  ).trim();
  const page = Number(searchParams.get("page") ?? "1") || 1;
  const regionCode = String(
    searchParams.get("region") ?? searchParams.get("region_code") ?? "",
  )
    .trim()
    .toUpperCase();

  // Prefer unified source tabs (all|dsers|cj|spocket|pod). Fall back to a single provider kind.
  const singleKind = parseSupplierKind(sourceRaw);
  const sourceTab = parseSourceTab(sourceRaw);

  try {
    if (singleKind && sourceRaw && !["all", "pod"].includes(sourceRaw.toLowerCase())) {
      const credentials = await loadCredentialsForKind(vendor.id, singleKind);
      let products = await searchExternalProducts(
        singleKind,
        query,
        credentials,
        page,
      );
      if (regionCode) {
        const { productMatchesSourcingRegion } = await import(
          "@/lib/suppliers/types"
        );
        products = products.filter((product) =>
          productMatchesSourcingRegion(product, regionCode),
        );
      }
      return NextResponse.json({
        ok: true,
        provider: singleKind,
        source: sourceTab,
        query,
        region: regionCode || null,
        count: products.length,
        products,
      });
    }

    const kinds = kindsForSourceTab(sourceTab);
    const credentialsByKind: Partial<
      Record<ExternalSupplierKind, SupplierCredentials | null>
    > = {};
    await Promise.all(
      kinds.map(async (kind) => {
        credentialsByKind[kind] = await loadCredentialsForKind(vendor.id, kind);
      }),
    );

    const products = await searchExternalProductsForTab(sourceTab, query, {
      credentialsByKind,
      page,
      regionCode: regionCode || null,
    });

    return NextResponse.json({
      ok: true,
      provider: sourceTab,
      source: sourceTab,
      query,
      region: regionCode || null,
      count: products.length,
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
