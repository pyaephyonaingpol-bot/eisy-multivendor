import { NextResponse } from "next/server";
import { getSessionProfile, canAccessVendor } from "@/lib/auth/session";
import {
  kindsForSourceTab,
  parseSourceTab,
  parseSupplierKind,
  searchExternalProductsForTab,
  searchExternalProductsPage,
} from "@/lib/suppliers";
import { toClientCatalogProducts } from "@/lib/suppliers/catalog-dto";
import { loadPlatformSupplierContext } from "@/lib/suppliers/platform-credentials";
import type {
  ExternalSupplierKind,
  SupplierCredentials,
} from "@/lib/suppliers/types";
import {
  productMatchesSourcingRegion,
  useLiveSupplierApi,
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
  const categoryId = String(
    searchParams.get("categoryId") ??
      searchParams.get("category_id") ??
      searchParams.get("category") ??
      "",
  ).trim();
  const regionCode = String(
    searchParams.get("region") ?? searchParams.get("region_code") ?? "",
  )
    .trim()
    .toUpperCase();

  const singleKind = parseSupplierKind(sourceRaw);
  const sourceTab = parseSourceTab(sourceRaw);
  const searchOptions = { categoryId: categoryId || null };

  try {
    if (
      singleKind &&
      sourceRaw &&
      !["all", "pod"].includes(sourceRaw.toLowerCase())
    ) {
      const credentials = await loadCredentialsForKind(singleKind);
      const pageResult = await searchExternalProductsPage(
        singleKind,
        query,
        credentials,
        page,
        searchOptions,
      );
      // hasMore is based on the unfiltered supplier page so region filters
      // do not hide later pages that may still match.
      let products = pageResult.products;
      if (regionCode) {
        products = products.filter((product) =>
          productMatchesSourcingRegion(product, regionCode),
        );
      }
      const clientProducts = toClientCatalogProducts(products);
      const liveAttempted = useLiveSupplierApi(singleKind, credentials);
      const usedMock =
        clientProducts.length > 0 &&
        clientProducts.every((product) => product.isMock === true);
      return NextResponse.json({
        ok: true,
        provider: singleKind,
        source: sourceTab,
        query,
        region: regionCode || null,
        categoryId: pageResult.categoryId ?? (categoryId || null),
        page: pageResult.page,
        pageSize: pageResult.pageSize,
        hasMore: pageResult.hasMore,
        total: pageResult.total ?? null,
        relatedCategories: pageResult.relatedCategories ?? [],
        count: clientProducts.length,
        products: clientProducts,
        platformManaged: true,
        catalogMode: usedMock || !liveAttempted ? "mock" : "live",
        usedMock,
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

    // Prefer CJ page metadata when the tab resolves to a single live source.
    if (kinds.length === 1 && kinds[0]) {
      const onlyKind = kinds[0];
      const pageResult = await searchExternalProductsPage(
        onlyKind,
        query,
        credentialsByKind[onlyKind] ?? null,
        page,
        searchOptions,
      );
      let products = pageResult.products;
      if (regionCode) {
        products = products.filter((product) =>
          productMatchesSourcingRegion(product, regionCode),
        );
      }
      const clientProducts = toClientCatalogProducts(products);
      const usedMock =
        clientProducts.length > 0 &&
        clientProducts.every((product) => product.isMock === true);
      const anyLive = useLiveSupplierApi(
        onlyKind,
        credentialsByKind[onlyKind] ?? null,
      );
      return NextResponse.json({
        ok: true,
        provider: sourceTab,
        source: sourceTab,
        query,
        region: regionCode || null,
        categoryId: pageResult.categoryId ?? (categoryId || null),
        page: pageResult.page,
        pageSize: pageResult.pageSize,
        hasMore: pageResult.hasMore,
        total: pageResult.total ?? null,
        relatedCategories: pageResult.relatedCategories ?? [],
        count: clientProducts.length,
        products: clientProducts,
        platformManaged: true,
        catalogMode: usedMock || !anyLive ? "mock" : "live",
        usedMock,
      });
    }

    const products = await searchExternalProductsForTab(sourceTab, query, {
      credentialsByKind,
      page,
      regionCode: regionCode || null,
    });

    const clientProducts = toClientCatalogProducts(products);
    const usedMock =
      clientProducts.length > 0 &&
      clientProducts.every((product) => product.isMock === true);
    const anyLive = kinds.some((kind) =>
      useLiveSupplierApi(kind, credentialsByKind[kind] ?? null),
    );

    return NextResponse.json({
      ok: true,
      provider: sourceTab,
      source: sourceTab,
      query,
      region: regionCode || null,
      categoryId: categoryId || null,
      page,
      hasMore: clientProducts.length >= 20,
      total: null,
      relatedCategories: [],
      count: clientProducts.length,
      products: clientProducts,
      platformManaged: true,
      catalogMode: usedMock || !anyLive ? "mock" : "live",
      usedMock,
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
