import { canAccessVendor, getSessionProfile } from "@/lib/auth/session";
import {
  matchesDeliverySpeed,
  parseDeliverySpeedFilter,
  shippingSpeedTagsForProduct,
  type DeliverySpeedFilter,
} from "@/lib/api/sourcing-filters";
import {
  kindsForSourceTab,
  parseSourceTab,
  parseSupplierKind,
  searchExternalProducts,
  searchExternalProductsForTab,
} from "@/lib/suppliers";
import { importExternalSupplierProductAction } from "@/lib/suppliers/actions";
import type {
  ExternalCatalogProduct,
  ExternalSupplierKind,
  SupplierCredentials,
} from "@/lib/suppliers/types";
import { getVendorForOwner, isVendorKycApproved } from "@/lib/vendors/queries";

export type SourcingControllerResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number };

async function requireApprovedVendorGate(): Promise<
  | { ok: true; session: NonNullable<Awaited<ReturnType<typeof getSessionProfile>>>; vendor: NonNullable<Awaited<ReturnType<typeof getVendorForOwner>>> }
  | { ok: false; error: string; status: number }
> {
  const session = await getSessionProfile();
  if (!session || !canAccessVendor(session.role)) {
    return { ok: false, error: "Sign in as a vendor.", status: 401 };
  }
  const vendor = await getVendorForOwner(session.userId);
  if (!vendor) {
    return { ok: false, error: "Submit a vendor application first.", status: 403 };
  }
  if (vendor.status !== "approved") {
    return { ok: false, error: "Approved vendor required.", status: 403 };
  }
  return { ok: true, session, vendor };
}

async function loadCredentialsForKind(
  kind: ExternalSupplierKind,
): Promise<SupplierCredentials | null> {
  const { loadPlatformSupplierContext } = await import("@/lib/suppliers/auth");
  const linked = await loadPlatformSupplierContext(kind);
  return linked?.credentials ?? null;
}

function withSpeedMeta(product: ExternalCatalogProduct) {
  return {
    ...product,
    shipping_speed_tags: shippingSpeedTagsForProduct(product),
  };
}

export async function searchSourcingCatalog(input: {
  source?: string | null;
  query?: string | null;
  region?: string | null;
  page?: number | null;
  deliverySpeed?: string | null;
}): Promise<
  SourcingControllerResult<{
    source: string;
    query: string;
    region: string | null;
    delivery_speed: DeliverySpeedFilter;
    count: number;
    products: ReturnType<typeof withSpeedMeta>[];
  }>
> {
  const gate = await requireApprovedVendorGate();
  if (!gate.ok) {
    return { ok: false, error: gate.error, status: gate.status };
  }

  const sourceRaw = input.source ?? "all";
  const query = String(input.query ?? "").trim();
  const page = Number(input.page ?? 1) || 1;
  const regionCode = String(input.region ?? "")
    .trim()
    .toUpperCase();
  const deliverySpeed = parseDeliverySpeedFilter(input.deliverySpeed);
  const singleKind = parseSupplierKind(sourceRaw);
  const sourceTab = parseSourceTab(sourceRaw);

  try {
    let products: ExternalCatalogProduct[];

    if (
      singleKind &&
      sourceRaw &&
      !["all", "pod"].includes(String(sourceRaw).toLowerCase())
    ) {
      const credentials = await loadCredentialsForKind(singleKind);
      products = await searchExternalProducts(
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
    } else {
      const kinds = kindsForSourceTab(sourceTab);
      const credentialsByKind: Partial<
        Record<ExternalSupplierKind, SupplierCredentials | null>
      > = {};
      await Promise.all(
        kinds.map(async (kind) => {
          credentialsByKind[kind] = await loadCredentialsForKind(kind);
        }),
      );
      products = await searchExternalProductsForTab(sourceTab, query, {
        credentialsByKind,
        page,
        regionCode: regionCode || null,
      });
    }

    const filtered = products
      .filter((product) => matchesDeliverySpeed(product, deliverySpeed))
      .map(withSpeedMeta);

    return {
      ok: true,
      data: {
        source: sourceTab,
        query,
        region: regionCode || null,
        delivery_speed: deliverySpeed,
        count: filtered.length,
        products: filtered,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Search failed.",
      status: 500,
    };
  }
}

export async function importSourcingProduct(input: {
  provider_kind?: string;
  external_product_id?: string;
  region_code?: string;
  price?: number | string;
  name?: string;
  description?: string;
  external_variant_id?: string;
  external_sku?: string;
  one_click?: boolean;
}): Promise<
  SourcingControllerResult<{
    productId?: string;
    success?: string;
    oneClick?: boolean;
  }>
> {
  const gate = await requireApprovedVendorGate();
  if (!gate.ok) {
    return { ok: false, error: gate.error, status: gate.status };
  }
  if (!isVendorKycApproved(gate.vendor)) {
    return {
      ok: false,
      error:
        "Complete KYC verification in Store settings before importing products.",
      status: 403,
    };
  }

  const formData = new FormData();
  formData.set("provider_kind", String(input.provider_kind ?? ""));
  formData.set("external_product_id", String(input.external_product_id ?? ""));
  formData.set("region_code", String(input.region_code ?? "GLOBAL"));
  if (input.price != null && input.price !== "") {
    formData.set("price", String(input.price));
  }
  if (input.name) formData.set("name", input.name);
  if (input.description) formData.set("description", input.description);
  if (input.external_variant_id) {
    formData.set("external_variant_id", input.external_variant_id);
  }
  if (input.external_sku) formData.set("external_sku", input.external_sku);
  if (input.one_click) formData.set("one_click", "1");

  const result = await importExternalSupplierProductAction(null, formData);
  if (!result || result.error) {
    return {
      ok: false,
      error: result?.error ?? "Import failed.",
      status: 400,
    };
  }

  return {
    ok: true,
    data: {
      productId: result.productId,
      success: result.success,
      oneClick: result.oneClick,
    },
  };
}
