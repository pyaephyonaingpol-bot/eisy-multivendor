import type {
  ExternalSupplierKind,
  SupplierCredentials,
} from "@/lib/suppliers/types";

/** Env / metadata keys used by each live supplier client. */
export const SUPPLIER_AUTH_ENV: Record<
  ExternalSupplierKind,
  {
    apiKey?: string;
    accessToken?: string;
    apiBase?: string;
    defaultBase: string;
    shopId?: string;
  }
> = {
  cj_dropshipping: {
    apiKey: "CJ_API_KEY",
    accessToken: "CJ_ACCESS_TOKEN",
    apiBase: "CJ_API_BASE",
    defaultBase: "https://developers.cjdropshipping.com/api2.0/v1",
  },
  dsers: {
    apiKey: "DSERS_API_KEY",
    apiBase: "DSERS_API_BASE",
    defaultBase: "https://api.dsers.com/v1",
  },
  spocket: {
    apiKey: "SPOCKET_API_KEY",
    apiBase: "SPOCKET_API_BASE",
    defaultBase: "https://api.spocket.co/v1",
  },
  printful: {
    apiKey: "PRINTFUL_API_KEY",
    apiBase: "PRINTFUL_API_BASE",
    defaultBase: "https://api.printful.com",
  },
  printify: {
    apiKey: "PRINTIFY_API_KEY",
    apiBase: "PRINTIFY_API_BASE",
    defaultBase: "https://api.printify.com/v1",
    shopId: "PRINTIFY_SHOP_ID",
  },
};

export function resolveSupplierCredentials(
  kind: ExternalSupplierKind,
  vendorCredentials?: SupplierCredentials | null,
): SupplierCredentials {
  const env = SUPPLIER_AUTH_ENV[kind];
  const apiKey =
    vendorCredentials?.apiKey?.trim() ||
    (env.apiKey ? process.env[env.apiKey]?.trim() : "") ||
    null;
  const accessToken =
    vendorCredentials?.accessToken?.trim() ||
    (env.accessToken ? process.env[env.accessToken]?.trim() : "") ||
    null;
  const apiSecret = vendorCredentials?.apiSecret?.trim() || null;
  const refreshToken = vendorCredentials?.refreshToken?.trim() || null;
  const accountEmail = vendorCredentials?.accountEmail?.trim() || null;

  const metadata: Record<string, unknown> = {
    ...(vendorCredentials?.metadata ?? {}),
  };

  if (env.shopId && !metadata.shop_id && !metadata.shopId) {
    const shop = process.env[env.shopId]?.trim();
    if (shop) metadata.shop_id = shop;
  }

  return {
    apiKey,
    apiSecret,
    accessToken,
    refreshToken,
    accountEmail,
    metadata,
  };
}

export function supplierApiBase(kind: ExternalSupplierKind): string {
  const env = SUPPLIER_AUTH_ENV[kind];
  const fromEnv = env.apiBase ? process.env[env.apiBase]?.trim() : "";
  return (fromEnv || env.defaultBase).replace(/\/$/, "");
}

export function hasLiveSupplierCredentials(
  kind: ExternalSupplierKind,
  credentials?: SupplierCredentials | null,
): boolean {
  const resolved = resolveSupplierCredentials(kind, credentials);
  return Boolean(resolved.apiKey || resolved.accessToken);
}

export function bearerAuthHeader(
  credentials: SupplierCredentials,
): Record<string, string> {
  const token =
    credentials.accessToken?.trim() || credentials.apiKey?.trim() || "";
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export function getPrintifyShopId(
  credentials?: SupplierCredentials | null,
): string | null {
  const resolved = resolveSupplierCredentials("printify", credentials);
  const meta = resolved.metadata ?? {};
  const shop = String(meta.shop_id ?? meta.shopId ?? "").trim();
  return shop || null;
}

/**
 * Map DB `supplier_provider_kind` (+ optional slug) to an adapter kind.
 * Jobs often store `print_on_demand` for both Printful and Printify.
 */
export function resolveAdapterKindFromProvider(input: {
  providerKind?: string | null;
  providerSlug?: string | null;
}): ExternalSupplierKind | null {
  const slug = (input.providerSlug ?? "").trim().toLowerCase();
  if (slug === "printful" || slug.includes("printful")) return "printful";
  if (slug === "printify" || slug.includes("printify")) return "printify";
  if (slug === "spocket") return "spocket";
  if (slug === "dsers" || slug.includes("dsers")) return "dsers";
  if (
    slug === "cj-dropshipping" ||
    slug === "cj_dropshipping" ||
    slug.includes("cj")
  ) {
    return "cj_dropshipping";
  }

  const kind = (input.providerKind ?? "").trim().toLowerCase();
  if (kind === "printful") return "printful";
  if (kind === "printify") return "printify";
  if (kind === "spocket") return "spocket";
  if (kind === "dsers") return "dsers";
  if (kind === "cj_dropshipping" || kind === "cj") return "cj_dropshipping";
  // Ambiguous POD — prefer Printful if only kind is print_on_demand
  if (kind === "print_on_demand") {
    if (hasLiveSupplierCredentials("printify")) return "printify";
    return "printful";
  }
  return null;
}

export function shouldFallbackToMock(): boolean {
  return process.env.SUPPLIER_INTEGRATIONS_FALLBACK_MOCK !== "0";
}
