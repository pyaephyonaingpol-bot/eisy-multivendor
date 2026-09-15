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
import type {
  ExternalCatalogProduct,
  ExternalInventorySnapshot,
  ExternalSupplierKind,
  SupplierCredentials,
  SupplierFulfillmentRequest,
  SupplierFulfillmentResult,
} from "@/lib/suppliers/types";

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
  if (value === "cj_dropshipping" || value === "cj" || value === "cj-dropshipping") {
    return "cj_dropshipping";
  }
  if (value === "dsers" || value === "aliexpress") {
    return "dsers";
  }
  return null;
}

export async function searchExternalProducts(
  kind: ExternalSupplierKind,
  query: string,
  credentials?: SupplierCredentials | null,
  page = 1,
): Promise<ExternalCatalogProduct[]> {
  if (kind === "cj_dropshipping") {
    return searchCjProducts(query, credentials, page);
  }
  return searchDsersProducts(query, credentials, page);
}

export async function getExternalProduct(
  kind: ExternalSupplierKind,
  externalProductId: string,
  credentials?: SupplierCredentials | null,
): Promise<ExternalCatalogProduct | null> {
  if (kind === "cj_dropshipping") {
    return getCjProduct(externalProductId, credentials);
  }
  return getDsersProduct(externalProductId, credentials);
}

export async function syncExternalInventory(
  kind: ExternalSupplierKind,
  externalProductId: string,
  credentials?: SupplierCredentials | null,
): Promise<ExternalInventorySnapshot> {
  if (kind === "cj_dropshipping") {
    return syncCjInventory(externalProductId, credentials);
  }
  return syncDsersInventory(externalProductId, credentials);
}

export async function createExternalFulfillmentOrder(
  kind: ExternalSupplierKind,
  request: SupplierFulfillmentRequest,
  credentials?: SupplierCredentials | null,
): Promise<SupplierFulfillmentResult> {
  if (kind === "cj_dropshipping") {
    return createCjOrder(request, credentials);
  }
  return createDsersOrder(request, credentials);
}
