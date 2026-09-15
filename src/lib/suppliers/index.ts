import {
  createCjOrder,
  getCjProduct,
  searchCjProducts,
  syncCjInventory,
} from "@/lib/suppliers/cj";
import {
  createDsersOrder,
  getDsersProduct,
  searchDsersProducts,
  syncDsersInventory,
} from "@/lib/suppliers/dsers";
import {
  createPrintfulOrder,
  createPrintifyOrder,
  getPrintfulProduct,
  getPrintifyProduct,
  searchPrintfulProducts,
  searchPrintifyProducts,
  syncPrintfulInventory,
  syncPrintifyInventory,
} from "@/lib/suppliers/pod";
import {
  createSpocketOrder,
  getSpocketProduct,
  searchSpocketProducts,
  syncSpocketInventory,
} from "@/lib/suppliers/spocket";
import type {
  ExternalCatalogProduct,
  ExternalInventorySnapshot,
  ExternalSupplierKind,
  SupplierCredentials,
  SupplierFulfillmentRequest,
  SupplierFulfillmentResult,
} from "@/lib/suppliers/types";
import { productMatchesSourcingRegion } from "@/lib/suppliers/types";

export type {
  ExternalCatalogProduct,
  ExternalInventorySnapshot,
  ExternalSupplierKind,
  SupplierCredentials,
  SupplierFulfillmentRequest,
  SupplierFulfillmentResult,
};

export function parseSupplierKind(
  value: string | null | undefined,
): ExternalSupplierKind | null {
  const raw = (value ?? "").trim().toLowerCase();
  if (
    raw === "cj_dropshipping" ||
    raw === "cj" ||
    raw === "cj-dropshipping" ||
    raw === "cjdropshipping"
  ) {
    return "cj_dropshipping";
  }
  if (raw === "dsers" || raw === "aliexpress" || raw === "dser") {
    return "dsers";
  }
  if (raw === "spocket") {
    return "spocket";
  }
  if (raw === "printful") {
    return "printful";
  }
  if (raw === "printify") {
    return "printify";
  }
  return null;
}

/** Source tab values for the unified sourcing UI (includes aggregate tabs). */
export type SupplierSourceTab =
  | "all"
  | "dsers"
  | "cj_dropshipping"
  | "spocket"
  | "pod";

export function parseSourceTab(
  value: string | null | undefined,
): SupplierSourceTab {
  const raw = (value ?? "").trim().toLowerCase();
  if (raw === "dsers" || raw === "dser" || raw === "aliexpress") return "dsers";
  if (
    raw === "cj" ||
    raw === "cj_dropshipping" ||
    raw === "cj-dropshipping"
  ) {
    return "cj_dropshipping";
  }
  if (raw === "spocket") return "spocket";
  if (raw === "pod" || raw === "printful" || raw === "printify") return "pod";
  return "all";
}

export function kindsForSourceTab(tab: SupplierSourceTab): ExternalSupplierKind[] {
  switch (tab) {
    case "dsers":
      return ["dsers"];
    case "cj_dropshipping":
      return ["cj_dropshipping"];
    case "spocket":
      return ["spocket"];
    case "pod":
      return ["printful", "printify"];
    case "all":
    default:
      return ["dsers", "cj_dropshipping", "spocket", "printful", "printify"];
  }
}

export async function searchExternalProducts(
  kind: ExternalSupplierKind,
  query: string,
  credentials?: SupplierCredentials | null,
  page = 1,
): Promise<ExternalCatalogProduct[]> {
  switch (kind) {
    case "cj_dropshipping":
      return searchCjProducts(query, credentials, page);
    case "dsers":
      return searchDsersProducts(query, credentials, page);
    case "spocket":
      return searchSpocketProducts(query, credentials, page);
    case "printful":
      return searchPrintfulProducts(query, credentials, page);
    case "printify":
      return searchPrintifyProducts(query, credentials, page);
    default:
      return [];
  }
}

export async function searchExternalProductsForTab(
  tab: SupplierSourceTab,
  query: string,
  options?: {
    credentialsByKind?: Partial<
      Record<ExternalSupplierKind, SupplierCredentials | null>
    >;
    page?: number;
    regionCode?: string | null;
  },
): Promise<ExternalCatalogProduct[]> {
  const kinds = kindsForSourceTab(tab);
  const page = options?.page ?? 1;
  const results = await Promise.all(
    kinds.map((kind) =>
      searchExternalProducts(
        kind,
        query,
        options?.credentialsByKind?.[kind] ?? null,
        page,
      ),
    ),
  );
  let products = results.flat();
  if (options?.regionCode) {
    products = products.filter((product) =>
      productMatchesSourcingRegion(product, options.regionCode),
    );
  }
  return products;
}

export async function getExternalProduct(
  kind: ExternalSupplierKind,
  externalProductId: string,
  credentials?: SupplierCredentials | null,
): Promise<ExternalCatalogProduct | null> {
  switch (kind) {
    case "cj_dropshipping":
      return getCjProduct(externalProductId, credentials);
    case "dsers":
      return getDsersProduct(externalProductId, credentials);
    case "spocket":
      return getSpocketProduct(externalProductId, credentials);
    case "printful":
      return getPrintfulProduct(externalProductId, credentials);
    case "printify":
      return getPrintifyProduct(externalProductId, credentials);
    default:
      return null;
  }
}

export async function syncExternalInventory(
  kind: ExternalSupplierKind,
  externalProductId: string,
  credentials?: SupplierCredentials | null,
): Promise<ExternalInventorySnapshot> {
  switch (kind) {
    case "cj_dropshipping":
      return syncCjInventory(externalProductId, credentials);
    case "dsers":
      return syncDsersInventory(externalProductId, credentials);
    case "spocket":
      return syncSpocketInventory(externalProductId, credentials);
    case "printful":
      return syncPrintfulInventory(externalProductId, credentials);
    case "printify":
      return syncPrintifyInventory(externalProductId, credentials);
    default:
      return {
        externalProductId,
        externalVariantId: null,
        externalSku: null,
        priceUsdt: null,
        stockQuantity: null,
        raw: {},
      };
  }
}

export async function createExternalFulfillmentOrder(
  kind: ExternalSupplierKind,
  request: SupplierFulfillmentRequest,
  credentials?: SupplierCredentials | null,
): Promise<SupplierFulfillmentResult> {
  switch (kind) {
    case "cj_dropshipping":
      return createCjOrder(request, credentials);
    case "dsers":
      return createDsersOrder(request, credentials);
    case "spocket":
      return createSpocketOrder(request, credentials);
    case "printful":
      return createPrintfulOrder(request, credentials);
    case "printify":
      return createPrintifyOrder(request, credentials);
    default:
      return {
        ok: false,
        supplierOrderRef: null,
        status: "failed",
        raw: {},
        error: `Unsupported supplier kind: ${kind}`,
      };
  }
}
