/** Shared types for external dropshipping platform adapters (CJ, DSers). */

export type ExternalSupplierKind = "cj_dropshipping" | "dsers";

export type ExternalCatalogProduct = {
  providerKind: ExternalSupplierKind;
  externalProductId: string;
  externalVariantId: string | null;
  externalSku: string | null;
  name: string;
  description: string | null;
  imageUrl: string | null;
  images: string[];
  priceUsdt: number;
  compareAtPriceUsdt: number | null;
  stockQuantity: number | null;
  warehouseCountry: string;
  shippingDaysMin: number | null;
  shippingDaysMax: number | null;
  raw: Record<string, unknown>;
};

export type ExternalInventorySnapshot = {
  externalProductId: string;
  externalVariantId: string | null;
  externalSku: string | null;
  priceUsdt: number | null;
  stockQuantity: number | null;
  raw: Record<string, unknown>;
};

export type SupplierShipTo = {
  fullName: string;
  phone: string | null;
  email: string | null;
  line1: string;
  line2: string | null;
  city: string;
  region: string | null;
  postalCode: string | null;
  countryCode: string;
};

export type SupplierFulfillmentLine = {
  externalProductId: string | null;
  externalVariantId: string | null;
  externalSku: string | null;
  quantity: number;
  listingProductId: string | null;
  productName: string;
  imageUrl: string | null;
};

export type SupplierFulfillmentRequest = {
  orderId: string;
  orderNumber: string;
  shipTo: SupplierShipTo;
  lines: SupplierFulfillmentLine[];
  note?: string | null;
};

export type SupplierFulfillmentResult = {
  ok: boolean;
  skipped?: boolean;
  supplierOrderRef: string | null;
  status: string;
  raw: Record<string, unknown>;
  error?: string;
};

export type SupplierCredentials = {
  apiKey?: string | null;
  apiSecret?: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  accountEmail?: string | null;
  metadata?: Record<string, unknown> | null;
};

export function supplierIntegrationsMode(): "live" | "mock" {
  const mode = process.env.SUPPLIER_INTEGRATIONS_MODE?.trim().toLowerCase();
  if (mode === "live") return "live";
  if (mode === "mock") return "mock";
  // Default to mock unless live credentials are clearly present.
  if (
    process.env.CJ_API_KEY?.trim() ||
    process.env.CJ_ACCESS_TOKEN?.trim() ||
    process.env.DSERS_API_KEY?.trim()
  ) {
    return "live";
  }
  return "mock";
}

export function slugifyExternalName(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "external-product"
  );
}
