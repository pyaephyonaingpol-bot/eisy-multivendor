import type {
  ExternalCatalogProduct,
  ExternalInventorySnapshot,
  SupplierCredentials,
  SupplierFulfillmentRequest,
  SupplierFulfillmentResult,
} from "@/lib/suppliers/types";
import { supplierIntegrationsMode } from "@/lib/suppliers/types";

/**
 * DSers / AliExpress adapter.
 * Live mode expects a merchant-facing REST bridge configured via DSERS_API_BASE
 * (your DSers-connected worker or middleware). Without credentials, mock catalog
 * is used so the vendor portal remains demoable.
 */
const DSERS_API_BASE =
  process.env.DSERS_API_BASE?.trim() || "https://api.dsers.com/v1";

type DsersJson = Record<string, unknown>;

function mockCatalog(query: string): ExternalCatalogProduct[] {
  const q = query.trim() || "aliexpress";
  return [1, 2, 3].map((n) => ({
    providerKind: "dsers" as const,
    externalProductId: `AE-MOCK-${q.slice(0, 12).toUpperCase()}-${n}`,
    externalVariantId: `AE-SKU-MOCK-${n}`,
    externalSku: `AE-SKU-MOCK-${n}`,
    name: `AliExpress / DSers ${q} #${n}`,
    description: `Mock DSers/AliExpress catalog item for “${q}”. Set DSERS_API_KEY + DSERS_API_BASE for live search.`,
    imageUrl: null,
    images: [],
    priceUsdt: Number((3.2 + n * 0.9).toFixed(2)),
    compareAtPriceUsdt: Number((5.5 + n).toFixed(2)),
    stockQuantity: 100 * n,
    warehouseCountry: "CN",
    shippingDaysMin: 7,
    shippingDaysMax: 25,
    raw: { mock: true, query: q, n },
  }));
}

async function dsersFetch(
  path: string,
  options: {
    method?: string;
    query?: Record<string, string | number | undefined>;
    body?: unknown;
    credentials?: SupplierCredentials | null;
  } = {},
): Promise<DsersJson> {
  const apiKey =
    options.credentials?.apiKey?.trim() ||
    process.env.DSERS_API_KEY?.trim() ||
    "";
  if (!apiKey && supplierIntegrationsMode() === "live") {
    throw new Error("DSers credentials missing. Set DSERS_API_KEY.");
  }

  const url = new URL(`${DSERS_API_BASE.replace(/\/$/, "")}${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value != null && value !== "") url.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const response = await fetch(url.toString(), {
    method: options.method ?? "GET",
    headers,
    body: options.body != null ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  const text = await response.text();
  let json: DsersJson = {};
  try {
    json = text ? (JSON.parse(text) as DsersJson) : {};
  } catch {
    throw new Error(`DSers API returned non-JSON (${response.status})`);
  }

  if (!response.ok) {
    throw new Error(
      `DSers API ${response.status}: ${String(json.message ?? json.error ?? text).slice(0, 240)}`,
    );
  }

  return json;
}

function mapDsersProduct(row: Record<string, unknown>): ExternalCatalogProduct {
  const imagesRaw = row.images ?? row.image_urls ?? row.imageUrls ?? [];
  const images = Array.isArray(imagesRaw)
    ? imagesRaw.map((x) => String(x)).filter(Boolean)
    : typeof row.image === "string" && row.image
      ? [row.image]
      : [];
  const price = Number(row.price ?? row.sale_price ?? row.salePrice ?? 0);
  return {
    providerKind: "dsers",
    externalProductId: String(
      row.product_id ?? row.productId ?? row.ae_product_id ?? row.id ?? "",
    ),
    externalVariantId: String(
      row.variant_id ?? row.variantId ?? row.sku_id ?? "",
    ) || null,
    externalSku: String(row.sku ?? row.external_sku ?? "") || null,
    name: String(row.title ?? row.name ?? "AliExpress product"),
    description: (row.description as string | null | undefined) ?? null,
    imageUrl: images[0] ?? (typeof row.image === "string" ? row.image : null),
    images,
    priceUsdt: Number.isFinite(price) && price > 0 ? price : 1,
    compareAtPriceUsdt: null,
    stockQuantity:
      row.stock != null && Number.isFinite(Number(row.stock))
        ? Number(row.stock)
        : null,
    warehouseCountry: String(row.warehouse_country ?? row.country ?? "CN"),
    shippingDaysMin: 7,
    shippingDaysMax: 30,
    raw: row,
  };
}

export async function searchDsersProducts(
  query: string,
  credentials?: SupplierCredentials | null,
  page = 1,
): Promise<ExternalCatalogProduct[]> {
  if (supplierIntegrationsMode() === "mock") {
    return mockCatalog(query);
  }

  try {
    const json = await dsersFetch("/products/search", {
      credentials,
      query: { q: query, page, limit: 20 },
    });
    const list = (json.data ?? json.products ?? json.items ?? []) as unknown;
    const rows = Array.isArray(list) ? list : [];
    return rows
      .map((row) => mapDsersProduct(row as Record<string, unknown>))
      .filter((p) => p.externalProductId);
  } catch (error) {
    if (process.env.SUPPLIER_INTEGRATIONS_FALLBACK_MOCK === "0") throw error;
    return mockCatalog(query);
  }
}

export async function getDsersProduct(
  externalProductId: string,
  credentials?: SupplierCredentials | null,
): Promise<ExternalCatalogProduct | null> {
  if (supplierIntegrationsMode() === "mock") {
    return mockCatalog(externalProductId)[0] ?? null;
  }

  const json = await dsersFetch(`/products/${encodeURIComponent(externalProductId)}`, {
    credentials,
  });
  const data = (json.data ?? json.product ?? json) as Record<string, unknown>;
  if (!data || typeof data !== "object") return null;
  const mapped = mapDsersProduct(data);
  return mapped.externalProductId ? mapped : null;
}

export async function syncDsersInventory(
  externalProductId: string,
  credentials?: SupplierCredentials | null,
): Promise<ExternalInventorySnapshot> {
  const product = await getDsersProduct(externalProductId, credentials);
  if (!product) {
    throw new Error("DSers product not found for inventory sync.");
  }
  return {
    externalProductId: product.externalProductId,
    externalVariantId: product.externalVariantId,
    externalSku: product.externalSku,
    priceUsdt: product.priceUsdt,
    stockQuantity: product.stockQuantity,
    raw: product.raw,
  };
}

export async function createDsersOrder(
  request: SupplierFulfillmentRequest,
  credentials?: SupplierCredentials | null,
): Promise<SupplierFulfillmentResult> {
  if (supplierIntegrationsMode() === "mock") {
    const ref = `DSERS-MOCK-${request.orderId.slice(0, 8).toUpperCase()}`;
    return {
      ok: true,
      supplierOrderRef: ref,
      status: "submitted",
      raw: { mock: true, request },
    };
  }

  try {
    const json = await dsersFetch("/orders", {
      method: "POST",
      credentials,
      body: {
        external_order_id: request.orderId,
        order_number: request.orderNumber,
        shipping_address: {
          name: request.shipTo.fullName,
          phone: request.shipTo.phone,
          email: request.shipTo.email,
          address1: request.shipTo.line1,
          address2: request.shipTo.line2,
          city: request.shipTo.city,
          province: request.shipTo.region,
          zip: request.shipTo.postalCode,
          country_code: request.shipTo.countryCode,
        },
        line_items: request.lines.map((line) => ({
          product_id: line.externalProductId,
          variant_id: line.externalVariantId,
          sku: line.externalSku,
          quantity: line.quantity,
          title: line.productName,
        })),
        note: request.note ?? `EISY order ${request.orderId}`,
      },
    });

    const data = (json.data ?? json.order ?? json) as Record<string, unknown>;
    const ref = String(
      data.order_id ?? data.id ?? data.aliexpress_order_id ?? data.dsers_order_id ?? "",
    );
    return {
      ok: Boolean(ref),
      supplierOrderRef: ref || null,
      status: ref ? "submitted" : "failed",
      raw: json,
      error: ref ? undefined : "DSers create order returned no order id.",
    };
  } catch (error) {
    return {
      ok: false,
      supplierOrderRef: null,
      status: "failed",
      raw: {},
      error:
        error instanceof Error ? error.message : "DSers create order failed.",
    };
  }
}
