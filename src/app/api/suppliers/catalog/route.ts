import { NextResponse } from "next/server";
import { getSessionProfile, canAccessVendor } from "@/lib/auth/session";
import {
  kindsForSourceTab,
  parseSourceTab,
  parseSupplierKind,
  searchExternalProducts,
  searchExternalProductsForTab,
} from "@/lib/suppliers";
import { loadPlatformSupplierContext } from "@/lib/suppliers/platform-credentials";
import type {
  ExternalSupplierKind,
  SupplierCredentials,
} from "@/lib/suppliers/types";
import { getVendorForOwner } from "@/lib/vendors/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadCredentialsForKind(
  kind: ExternalSupplierKind,
): Promise<SupplierCredentials | null> {
  const linked = await loadPlatformSupplierContext(kind);
  return linked?.credentials ?? null;
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

  const singleKind = parseSupplierKind(sourceRaw);
  const sourceTab = parseSourceTab(sourceRaw);

  try {
    if (
      singleKind &&
      sourceRaw &&
      !["all", "pod"].includes(sourceRaw.toLowerCase())
    ) {
      const credentials = await loadCredentialsForKind(singleKind);
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
        platformManaged: true,
      });
    }

    const kinds = kindsForSourceTab(sourceTab);
    const credentialsByKind: Partial<
      Record<ExternalSupplierKind, SupplierCredentials | null>
    > = {};
    await Promise.all(
      kinds.map(async (kind) => {
        credentialsByKind[kind] = await loadCredentialsForKind(kind);
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
      platformManaged: true,
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
