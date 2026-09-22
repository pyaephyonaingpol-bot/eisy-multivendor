import type {
  ExternalSupplierKind,
  SupplierCredentials,
} from "@/lib/suppliers/types";

/** Env / metadata keys used by each live supplier client (platform-owned). */
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

function emptyCredentials(): SupplierCredentials {
  return {
    apiKey: null,
    apiSecret: null,
    accessToken: null,
    refreshToken: null,
    accountEmail: null,
    metadata: {},
  };
}

/** Merge credential layers; earlier layers win for each field. */
export function mergeSupplierCredentials(
  ...layers: Array<SupplierCredentials | null | undefined>
): SupplierCredentials {
  const out = emptyCredentials();
  const metadata: Record<string, unknown> = {};

  for (const layer of [...layers].reverse()) {
    if (!layer) continue;
    if (layer.apiKey?.trim()) out.apiKey = layer.apiKey.trim();
    if (layer.apiSecret?.trim()) out.apiSecret = layer.apiSecret.trim();
    if (layer.accessToken?.trim()) out.accessToken = layer.accessToken.trim();
    if (layer.refreshToken?.trim()) out.refreshToken = layer.refreshToken.trim();
    if (layer.accountEmail?.trim()) out.accountEmail = layer.accountEmail.trim();
    Object.assign(metadata, layer.metadata ?? {});
  }

  out.metadata = metadata;
  return out;
}

export function credentialsFromEnv(
  kind: ExternalSupplierKind,
): SupplierCredentials {
  const env = SUPPLIER_AUTH_ENV[kind];
  const metadata: Record<string, unknown> = {};
  if (env.shopId) {
    const shop = process.env[env.shopId]?.trim();
    if (shop) metadata.shop_id = shop;
  }

  return {
    apiKey: (env.apiKey ? process.env[env.apiKey]?.trim() : "") || null,
    apiSecret: null,
    accessToken:
      (env.accessToken ? process.env[env.accessToken]?.trim() : "") || null,
    refreshToken: null,
    accountEmail: null,
    metadata,
  };
}

/**
 * Resolve supplier API credentials for catalog / import / fulfillment.
 *
 * Platform-owned keys win (DB row via `platform` arg, then env).
 * Per-vendor keys are ignored unless ALLOW_VENDOR_SUPPLIER_KEYS=1.
 */
export function resolveSupplierCredentials(
  kind: ExternalSupplierKind,
  vendorCredentials?: SupplierCredentials | null,
  platformCredentials?: SupplierCredentials | null,
): SupplierCredentials {
  const env = credentialsFromEnv(kind);
  const platform = mergeSupplierCredentials(platformCredentials, env);

  if (
    process.env.ALLOW_VENDOR_SUPPLIER_KEYS === "1" &&
    vendorCredentials &&
    (vendorCredentials.apiKey || vendorCredentials.accessToken)
  ) {
    return mergeSupplierCredentials(vendorCredentials, platform);
  }

  return platform;
}

export function supplierApiBase(kind: ExternalSupplierKind): string {
  const env = SUPPLIER_AUTH_ENV[kind];
  const fromEnv = env.apiBase ? process.env[env.apiBase]?.trim() : "";
  return (fromEnv || env.defaultBase).replace(/\/$/, "");
}

export function hasLiveSupplierCredentials(
  kind: ExternalSupplierKind,
  credentials?: SupplierCredentials | null,
  platformCredentials?: SupplierCredentials | null,
): boolean {
  const resolved = resolveSupplierCredentials(
    kind,
    credentials,
    platformCredentials,
  );
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
  const resolved = resolveSupplierCredentials("printify", null, credentials);
  const meta = resolved.metadata ?? {};
  const shop = String(meta.shop_id ?? meta.shopId ?? "").trim();
  return shop || null;
}

/**
 * Map DB `supplier_provider_kind` (+ optional slug) to an adapter kind.
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
  if (kind === "print_on_demand") {
    if (hasLiveSupplierCredentials("printify")) return "printify";
    return "printful";
  }
  return null;
}

export function shouldFallbackToMock(): boolean {
  return process.env.SUPPLIER_INTEGRATIONS_FALLBACK_MOCK !== "0";
}

/** Which platform suppliers currently have live keys configured (env). */
export function listConfiguredPlatformSuppliers(): ExternalSupplierKind[] {
  const kinds: ExternalSupplierKind[] = [
    "cj_dropshipping",
    "dsers",
    "spocket",
    "printful",
    "printify",
  ];
  return kinds.filter((kind) => hasLiveSupplierCredentials(kind));
}
