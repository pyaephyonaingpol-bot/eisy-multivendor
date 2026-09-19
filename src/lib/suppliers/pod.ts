import type {
  ExternalCatalogProduct,
  ExternalInventorySnapshot,
  ExternalSupplierKind,
  SupplierCredentials,
  SupplierFulfillmentRequest,
  SupplierFulfillmentResult,
} from "@/lib/suppliers/types";
import { supplierIntegrationsMode } from "@/lib/suppliers/types";

export type PodProviderKind = Extract<
  ExternalSupplierKind,
  "printful" | "printify"
>;

type PodJson = Record<string, unknown>;

const POD_CONFIG: Record<
  PodProviderKind,
  { label: string; envKey: string; envBase: string; defaultBase: string; prefix: string }
> = {
  printful: {
    label: "Printful",
    envKey: "PRINTFUL_API_KEY",
    envBase: "PRINTFUL_API_BASE",
    defaultBase: "https://api.printful.com",
    prefix: "PFL",
  },
  printify: {
    label: "Printify",
    envKey: "PRINTIFY_API_KEY",
    envBase: "PRINTIFY_API_BASE",
    defaultBase: "https://api.printify.com/v1",
    prefix: "PFY",
  },
};

function mockCatalog(
  kind: PodProviderKind,
  query: string,
): ExternalCatalogProduct[] {
  const cfg = POD_CONFIG[kind];
  const q = query.trim() || "tee";
  return [1, 2, 3].map((n) => {
    const seed = `${cfg.prefix.toLowerCase()}-${q.slice(0, 8)}-${n}`.replace(
      /\s+/g,
      "-",
    );
    const images = [
      `https://picsum.photos/seed/${seed}-a/800/800`,
      `https://picsum.photos/seed/${seed}-b/800/800`,
    ];
    const base = Number((12 + n * 3.25).toFixed(2));
    return {
      providerKind: kind,
      externalProductId: `${cfg.prefix}-MOCK-${q.slice(0, 10).toUpperCase()}-${n}`,
      externalVariantId: `${cfg.prefix}-VAR-${n}-M`,
      externalSku: `${cfg.prefix}-SKU-${n}-M`,
      name: `${cfg.label} ${q} print #${n}`,
      description: [
        `${cfg.label} print-on-demand ${q} (mock catalog).`,
        "",
        "POD details",
        "• Made-to-order — no warehouse inventory sitting idle",
        "• US / EU print hubs for regional delivery",
        "• Variants include size + color blanks",
        "",
        `Connect ${cfg.envKey} for live ${cfg.label} catalog sync.`,
      ].join("\n"),
      imageUrl: images[0],
      images,
      priceUsdt: base,
      compareAtPriceUsdt: Number((base * 1.6).toFixed(2)),
      stockQuantity: 999,
      warehouseCountry: n % 2 === 0 ? "US" : "EU",
      shippingDaysMin: 3,
      shippingDaysMax: 12,
      variants: [
        {
          externalVariantId: `${cfg.prefix}-VAR-${n}-S`,
          externalSku: `${cfg.prefix}-SKU-${n}-S`,
          label: "S / Black",
          priceUsdt: base,
          stockQuantity: 999,
          imageUrl: images[0],
        },
        {
          externalVariantId: `${cfg.prefix}-VAR-${n}-M`,
          externalSku: `${cfg.prefix}-SKU-${n}-M`,
          label: "M / Black",
          priceUsdt: Number((base + 0.5).toFixed(2)),
          stockQuantity: 999,
          imageUrl: images[0],
        },
        {
          externalVariantId: `${cfg.prefix}-VAR-${n}-L`,
          externalSku: `${cfg.prefix}-SKU-${n}-L`,
          label: "L / White",
          priceUsdt: Number((base + 1).toFixed(2)),
          stockQuantity: 999,
          imageUrl: images[1],
        },
      ],
      raw: { mock: true, provider: kind, query: q, n },
    };
  });
}

async function podFetch(
  kind: PodProviderKind,
  path: string,
  options: {
    method?: string;
    query?: Record<string, string | number | undefined>;
    body?: unknown;
    credentials?: SupplierCredentials | null;
  } = {},
): Promise<PodJson> {
  const cfg = POD_CONFIG[kind];
  const apiKey =
    options.credentials?.apiKey?.trim() ||
    options.credentials?.accessToken?.trim() ||
    process.env[cfg.envKey]?.trim() ||
    "";
  if (!apiKey && supplierIntegrationsMode() === "live") {
    throw new Error(`${cfg.label} credentials missing. Set ${cfg.envKey}.`);
  }

  const base =
    process.env[cfg.envBase]?.trim() || cfg.defaultBase;
  const url = new URL(`${base.replace(/\/$/, "")}${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value != null && value !== "") url.searchParams.set(key, String(value));
  }

  const response = await fetch(url.toString(), {
    method: options.method ?? "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: options.body != null ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  const json = (await response.json().catch(() => ({}))) as PodJson;
  if (!response.ok) {
    throw new Error(
      String(json.message ?? json.error ?? `${cfg.label} HTTP ${response.status}`),
    );
  }
  return json;
}

function mapPodProduct(
  kind: PodProviderKind,
  row: Record<string, unknown>,
): ExternalCatalogProduct {
  const id = String(row.id ?? row.product_id ?? "");
  const price = Number(
    row.price ??
      (row.variants as { price?: number }[] | undefined)?.[0]?.price ??
      0,
  );
  const images = Array.isArray(row.images)
    ? row.images.map((img) =>
        typeof img === "string"
          ? img
          : String((img as { src?: string }).src ?? ""),
      )
    : [];
  return {
    providerKind: kind,
    externalProductId: id,
    externalVariantId: null,
    externalSku: row.sku ? String(row.sku) : null,
    name: String(row.title ?? row.name ?? `${POD_CONFIG[kind].label} product`),
    description: row.description ? String(row.description) : null,
    imageUrl: images[0] ?? null,
    images: images.filter(Boolean),
    priceUsdt: Number.isFinite(price) ? price : 0,
    compareAtPriceUsdt: null,
    stockQuantity: 999,
    warehouseCountry: String(row.country_code ?? "US"),
    shippingDaysMin: 3,
    shippingDaysMax: 12,
    raw: row,
  };
}

export async function searchPodProducts(
  kind: PodProviderKind,
  query: string,
  credentials?: SupplierCredentials | null,
  page = 1,
): Promise<ExternalCatalogProduct[]> {
  if (supplierIntegrationsMode() === "mock") {
    return mockCatalog(kind, query);
  }

  if (kind === "printify") {
    try {
      const { fetchPrintifyProducts, isPrintifyConfigured } = await import(
        "@/lib/printify"
      );
      const shopId =
        (credentials?.metadata?.shop_id as string | undefined) ||
        (credentials?.metadata?.shopId as string | undefined) ||
        process.env.PRINTIFY_SHOP_ID?.trim() ||
        null;
      const apiKey =
        credentials?.apiKey?.trim() ||
        credentials?.accessToken?.trim() ||
        process.env.PRINTIFY_API_KEY?.trim() ||
        null;

      if (!isPrintifyConfigured({ apiKey, shopId })) {
        return mockCatalog(kind, query);
      }

      const { products } = await fetchPrintifyProducts({
        page,
        limit: 24,
        apiKey,
        shopId,
      });
      const q = query.trim().toLowerCase();
      const mapped = products
        .map((row) => mapPodProduct(kind, row as Record<string, unknown>))
        .filter((product) =>
          q
            ? product.name.toLowerCase().includes(q) ||
              (product.description ?? "").toLowerCase().includes(q)
            : true,
        );
      if (mapped.length === 0) return mockCatalog(kind, query);
      return mapped;
    } catch {
      return mockCatalog(kind, query);
    }
  }

  try {
    const path = "/store/products";
    const json = await podFetch(kind, path, {
      query: { search: query, page, limit: 24 },
      credentials,
    });
    const rows = Array.isArray(json.result)
      ? (json.result as Record<string, unknown>[])
      : Array.isArray(json.data)
        ? (json.data as Record<string, unknown>[])
        : [];
    if (rows.length === 0) return mockCatalog(kind, query);
    return rows.map((row) => mapPodProduct(kind, row));
  } catch {
    return mockCatalog(kind, query);
  }
}

export async function getPodProduct(
  kind: PodProviderKind,
  externalProductId: string,
  credentials?: SupplierCredentials | null,
): Promise<ExternalCatalogProduct | null> {
  const prefix = POD_CONFIG[kind].prefix;
  if (
    supplierIntegrationsMode() === "mock" ||
    externalProductId.startsWith(`${prefix}-MOCK-`)
  ) {
    return (
      mockCatalog(kind, "detail").find(
        (p) => p.externalProductId === externalProductId,
      ) ??
      mockCatalog(kind, externalProductId)[0] ??
      null
    );
  }

  if (kind === "printify") {
    try {
      const { fetchPrintifyProduct } = await import("@/lib/printify");
      const shopId =
        (credentials?.metadata?.shop_id as string | undefined) ||
        (credentials?.metadata?.shopId as string | undefined) ||
        process.env.PRINTIFY_SHOP_ID?.trim() ||
        null;
      const apiKey =
        credentials?.apiKey?.trim() ||
        credentials?.accessToken?.trim() ||
        process.env.PRINTIFY_API_KEY?.trim() ||
        null;
      const product = await fetchPrintifyProduct(externalProductId, {
        apiKey,
        shopId,
      });
      return mapPodProduct(kind, product as Record<string, unknown>);
    } catch {
      return mockCatalog(kind, externalProductId)[0] ?? null;
    }
  }

  try {
    const path = `/store/products/${encodeURIComponent(externalProductId)}`;
    const json = await podFetch(kind, path, { credentials });
    const row = (json.result ?? json.data ?? json) as Record<string, unknown>;
    return mapPodProduct(kind, row);
  } catch {
    return mockCatalog(kind, externalProductId)[0] ?? null;
  }
}

export async function syncPodInventory(
  kind: PodProviderKind,
  externalProductId: string,
  credentials?: SupplierCredentials | null,
): Promise<ExternalInventorySnapshot> {
  const product = await getPodProduct(kind, externalProductId, credentials);
  return {
    externalProductId,
    externalVariantId: product?.externalVariantId ?? null,
    externalSku: product?.externalSku ?? null,
    priceUsdt: product?.priceUsdt ?? null,
    stockQuantity: product?.stockQuantity ?? null,
    raw: product?.raw ?? {},
  };
}

export async function createPodOrder(
  kind: PodProviderKind,
  request: SupplierFulfillmentRequest,
  credentials?: SupplierCredentials | null,
): Promise<SupplierFulfillmentResult> {
  if (supplierIntegrationsMode() === "mock") {
    return {
      ok: true,
      supplierOrderRef: `${POD_CONFIG[kind].prefix}-MOCK-ORD-${request.orderId.slice(0, 8)}`,
      status: "submitted",
      raw: { mock: true, provider: kind, request },
    };
  }
  try {
    if (kind === "printful") {
      const json = await podFetch(kind, "/orders", {
        method: "POST",
        credentials,
        body: {
          external_id: request.orderId,
          recipient: {
            name: request.shipTo.fullName,
            address1: request.shipTo.line1,
            address2: request.shipTo.line2 ?? "",
            city: request.shipTo.city,
            state_code: request.shipTo.region ?? "",
            country_code: request.shipTo.countryCode,
            zip: request.shipTo.postalCode ?? "",
            phone: request.shipTo.phone ?? "",
            email: request.shipTo.email ?? "",
          },
          items: request.lines.map((line) => ({
            sync_variant_id: Number(line.externalVariantId) || undefined,
            external_variant_id: line.externalVariantId,
            sku: line.externalSku,
            quantity: line.quantity,
            name: line.productName,
            files: line.imageUrl
              ? [{ url: line.imageUrl, type: "default" }]
              : undefined,
          })),
          packing_slip: request.note
            ? { email: request.shipTo.email, message: request.note }
            : undefined,
        },
      });
      const result = (json.result ?? json) as Record<string, unknown>;
      const ref = String(result.id ?? result.order_id ?? "");
      // Confirm for fulfillment when Printful returns a draft id.
      if (ref) {
        try {
          await podFetch(kind, `/orders/${encodeURIComponent(ref)}/confirm`, {
            method: "POST",
            credentials,
          });
        } catch {
          // Confirm may fail if already confirmed / sandbox — order still created.
        }
      }
      return {
        ok: Boolean(ref),
        supplierOrderRef: ref || null,
        status: String(result.status ?? (ref ? "submitted" : "failed")),
        raw: json,
        error: ref ? undefined : "Printful create order returned no id.",
      };
    }

    // Printify — dedicated client (PRINTIFY_API_KEY + PRINTIFY_SHOP_ID)
    const {
      submitPrintifyOrderOnPurchase,
      PrintifyConfigError,
      PrintifyApiError,
    } = await import("@/lib/printify");
    const { getPrintifyShopId } = await import("@/lib/suppliers/auth");
    const shopId = getPrintifyShopId(credentials);
    const apiKey =
      credentials?.apiKey?.trim() ||
      credentials?.accessToken?.trim() ||
      process.env.PRINTIFY_API_KEY?.trim() ||
      null;

    if (!shopId) {
      return {
        ok: false,
        supplierOrderRef: null,
        status: "failed",
        raw: {},
        error:
          "Printify shop id missing. Set PRINTIFY_SHOP_ID or credentials.metadata.shop_id.",
      };
    }
    if (!apiKey) {
      return {
        ok: false,
        supplierOrderRef: null,
        status: "failed",
        raw: {},
        error: "Printify API key missing. Set PRINTIFY_API_KEY.",
      };
    }

    const lines = request.lines
      .filter((line) => line.externalProductId && line.externalVariantId)
      .map((line) => ({
        productId: String(line.externalProductId),
        variantId: line.externalVariantId as string | number,
        quantity: line.quantity,
      }));

    if (lines.length === 0) {
      return {
        ok: false,
        supplierOrderRef: null,
        status: "failed",
        raw: {},
        error:
          "Printify order requires external product_id and variant_id on each line.",
      };
    }

    try {
      const result = await submitPrintifyOrderOnPurchase({
        orderId: request.orderId,
        shippingAddress: {
          full_name: request.shipTo.fullName,
          phone: request.shipTo.phone,
          email: request.shipTo.email,
          line1: request.shipTo.line1,
          line2: request.shipTo.line2,
          city: request.shipTo.city,
          region: request.shipTo.region,
          postal_code: request.shipTo.postalCode,
          country: request.shipTo.countryCode,
        },
        buyerEmail: request.shipTo.email,
        lines,
        apiKey,
        shopId,
        sendToProduction: true,
      });

      const ref = String(result.order.id ?? "");
      return {
        ok: Boolean(ref),
        supplierOrderRef: ref || null,
        status: String(
          result.order.status ?? (ref ? "submitted" : "failed"),
        ),
        raw: {
          order: result.order,
          sent_to_production: result.sentToProduction,
          production_error: result.productionError ?? null,
        },
        error: ref
          ? result.productionError
          : "Printify create order returned no id.",
      };
    } catch (error) {
      const message =
        error instanceof PrintifyConfigError ||
        error instanceof PrintifyApiError ||
        error instanceof Error
          ? error.message
          : "Printify order failed";
      return {
        ok: false,
        supplierOrderRef: null,
        status: "failed",
        raw: {},
        error: message,
      };
    }
  } catch (error) {
    return {
      ok: false,
      supplierOrderRef: null,
      status: "failed",
      raw: {},
      error:
        error instanceof Error
          ? error.message
          : `${POD_CONFIG[kind].label} order failed`,
    };
  }
}

export const searchPrintfulProducts = (
  query: string,
  credentials?: SupplierCredentials | null,
  page = 1,
) => searchPodProducts("printful", query, credentials, page);

export const getPrintfulProduct = (
  id: string,
  credentials?: SupplierCredentials | null,
) => getPodProduct("printful", id, credentials);

export const syncPrintfulInventory = (
  id: string,
  credentials?: SupplierCredentials | null,
) => syncPodInventory("printful", id, credentials);

export const createPrintfulOrder = (
  request: SupplierFulfillmentRequest,
  credentials?: SupplierCredentials | null,
) => createPodOrder("printful", request, credentials);

export const searchPrintifyProducts = (
  query: string,
  credentials?: SupplierCredentials | null,
  page = 1,
) => searchPodProducts("printify", query, credentials, page);

export const getPrintifyProduct = (
  id: string,
  credentials?: SupplierCredentials | null,
) => getPodProduct("printify", id, credentials);

export const syncPrintifyInventory = (
  id: string,
  credentials?: SupplierCredentials | null,
) => syncPodInventory("printify", id, credentials);

export const createPrintifyOrder = (
  request: SupplierFulfillmentRequest,
  credentials?: SupplierCredentials | null,
) => createPodOrder("printify", request, credentials);
