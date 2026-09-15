/** Shared types for external dropshipping platform adapters. */

export type ExternalSupplierKind =
  | "cj_dropshipping"
  | "dsers"
  | "spocket"
  | "printful"
  | "printify";

/** Default sell price = supplier cost × this markup for one-click imports. */
export const ONE_CLICK_IMPORT_MARKUP = 1.35;

/** Imported listings must have at least this much supplier stock on hand. */
export const MIN_IMPORT_STOCK_QUANTITY = 10;

export type ExternalProductVariant = {
  externalVariantId: string;
  externalSku: string | null;
  label: string;
  priceUsdt: number;
  stockQuantity: number | null;
  imageUrl: string | null;
};

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
  /** Optional SKU / option variants for preview + import. */
  variants?: ExternalProductVariant[];
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
    process.env.DSERS_API_KEY?.trim() ||
    process.env.SPOCKET_API_KEY?.trim() ||
    process.env.PRINTFUL_API_KEY?.trim() ||
    process.env.PRINTIFY_API_KEY?.trim()
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

/** Maps adapter kind → supplier_providers.slug (POD shares print_on_demand kind). */
export const SUPPLIER_PROVIDER_SLUGS: Record<ExternalSupplierKind, string> = {
  cj_dropshipping: "cj-dropshipping",
  dsers: "dsers",
  spocket: "spocket",
  printful: "printful",
  printify: "printify",
};

export function supplierPlatformLabel(kind: ExternalSupplierKind): string {
  switch (kind) {
    case "cj_dropshipping":
      return "CJ Dropshipping";
    case "dsers":
      return "DSers";
    case "spocket":
      return "Spocket";
    case "printful":
      return "Printful";
    case "printify":
      return "Printify";
    default:
      return kind;
  }
}

/** True when supplier stock meets the store minimum inventory rule. */
export function meetsMinImportStock(
  stockQuantity: number | null | undefined,
): boolean {
  return stockQuantity != null && stockQuantity >= MIN_IMPORT_STOCK_QUANTITY;
}

/** Map warehouse country codes to sourcing region codes used by the store. */
export function warehouseCountryToRegionCodes(country: string): string[] {
  const code = country.trim().toUpperCase();
  if (!code) return ["GLOBAL"];
  if (code === "MM") return ["MM", "SEA", "GLOBAL"];
  if (["TH", "SG", "MY", "ID", "VN", "KH", "LA", "PH", "BN"].includes(code)) {
    return ["SEA", "GLOBAL"];
  }
  if (["CN", "HK", "TW", "KR", "JP"].includes(code)) {
    return ["CN", "SEA", "GLOBAL"];
  }
  if (["US", "CA", "MX"].includes(code)) return ["US", "GLOBAL"];
  if (
    [
      "DE",
      "FR",
      "IT",
      "ES",
      "NL",
      "BE",
      "PL",
      "SE",
      "AT",
      "IE",
      "PT",
      "GB",
      "EU",
    ].includes(code)
  ) {
    return ["EU", "GLOBAL"];
  }
  return ["GLOBAL"];
}

export function productMatchesSourcingRegion(
  product: ExternalCatalogProduct,
  regionCode: string | null | undefined,
): boolean {
  const region = (regionCode ?? "GLOBAL").trim().toUpperCase() || "GLOBAL";
  if (region === "GLOBAL") return true;
  const covered = warehouseCountryToRegionCodes(product.warehouseCountry);
  return covered.includes(region) || covered.includes("GLOBAL");
}
