import type {
  ExternalCatalogProduct,
  ExternalInventorySnapshot,
  SupplierCredentials,
  SupplierFulfillmentRequest,
  SupplierFulfillmentResult,
} from "@/lib/suppliers/types";
import { useLiveSupplierApi } from "@/lib/suppliers/types";
import { shouldFallbackToMock } from "@/lib/suppliers/auth";

/** Spocket — US/EU dropship catalog adapter. */
const SPOCKET_API_BASE =
  process.env.SPOCKET_API_BASE?.trim() || "https://api.spocket.co/v1";

type SpocketJson = Record<string, unknown>;

function mockCatalog(query: string): ExternalCatalogProduct[] {
  const q = query.trim() || "lifestyle";
  return [1, 2, 3, 4].map((n) => {
    const seed = `spk-${q.slice(0, 8)}-${n}`.replace(/\s+/g, "-");
    const images = [
      `https://picsum.photos/seed/${seed}-a/800/800`,
      `https://picsum.photos/seed/${seed}-b/800/800`,
    ];
    const base = Number((8.5 + n * 2.1).toFixed(2));
    const warehouse = n % 2 === 0 ? "US" : "EU";
    return {
      providerKind: "spocket" as const,
      externalProductId: `SPK-MOCK-${q.slice(0, 10).toUpperCase()}-${n}`,
      externalVariantId: `SPK-VAR-${n}-STD`,
      externalSku: `SPK-SKU-${n}-STD`,
      name: `Spocket ${q} #${n}`,
      description: [
        `Spocket ${warehouse} warehouse listing for ${q} (mock catalog).`,
        "",
        "Why Spocket",
        `• Ships from ${warehouse === "US" ? "United States" : "Europe"} for faster Western delivery`,
        "• Branded packaging options on eligible SKUs",
        "• Typically 2–8 day dispatch for local warehouses",
        "",
        "Preview variants before Import to Store. Connect SPOCKET_API_KEY for live search.",
      ].join("\n"),
      imageUrl: images[0],
      images,
      priceUsdt: base,
      compareAtPriceUsdt: Number((base * 1.45).toFixed(2)),
      stockQuantity: 40 + n * 15,
      warehouseCountry: warehouse,
      shippingDaysMin: warehouse === "US" ? 2 : 3,
      shippingDaysMax: warehouse === "US" ? 7 : 9,
      variants: [
        {
          externalVariantId: `SPK-VAR-${n}-STD`,
          externalSku: `SPK-SKU-${n}-STD`,
          label: "Standard",
          priceUsdt: base,
          stockQuantity: 25 + n * 8,
          imageUrl: images[0],
        },
        {
          externalVariantId: `SPK-VAR-${n}-PREM`,
          externalSku: `SPK-SKU-${n}-PREM`,
          label: "Premium pack",
          priceUsdt: Number((base + 2.5).toFixed(2)),
          stockQuantity: 15 + n * 5,
          imageUrl: images[1],
        },
      ],
      raw: { mock: true, query: q, n, warehouse },
    };
  });
}

async function spocketFetch(
  path: string,
  options: {
    method?: string;
    query?: Record<string, string | number | undefined>;
    body?: unknown;
    credentials?: SupplierCredentials | null;
  } = {},
): Promise<SpocketJson> {
  const apiKey =
    options.credentials?.apiKey?.trim() ||
    process.env.SPOCKET_API_KEY?.trim() ||
    "";
  if (!apiKey) {
    throw new Error(
      "Spocket credentials missing. Save a platform Spocket API key or set SPOCKET_API_KEY.",
    );
  }

  const url = new URL(`${SPOCKET_API_BASE.replace(/\/$/, "")}${path}`);
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

  const json = (await response.json().catch(() => ({}))) as SpocketJson;
  if (!response.ok) {
    throw new Error(
      String(json.message ?? json.error ?? `Spocket HTTP ${response.status}`),
    );
  }
  return json;
}

function mapSpocketProduct(row: Record<string, unknown>): ExternalCatalogProduct {
  const id = String(row.id ?? row.product_id ?? "");
  const price = Number(row.price ?? row.price_usd ?? 0);
  const images = Array.isArray(row.images)
    ? row.images.map((img) => String(img))
    : row.image_url
      ? [String(row.image_url)]
      : [];
  return {
    providerKind: "spocket",
    externalProductId: id,
    externalVariantId: row.variant_id ? String(row.variant_id) : null,
    externalSku: row.sku ? String(row.sku) : null,
    name: String(row.title ?? row.name ?? "Spocket product"),
    description: row.description ? String(row.description) : null,
    imageUrl: images[0] ?? null,
    images,
    priceUsdt: Number.isFinite(price) ? price : 0,
    compareAtPriceUsdt: row.compare_at ? Number(row.compare_at) : null,
    stockQuantity:
      row.inventory != null
        ? Number(row.inventory)
        : row.stock != null
          ? Number(row.stock)
          : null,
    warehouseCountry: String(row.country_code ?? row.warehouse_country ?? "US"),
    shippingDaysMin:
      row.shipping_days_min != null ? Number(row.shipping_days_min) : 2,
    shippingDaysMax:
      row.shipping_days_max != null ? Number(row.shipping_days_max) : 8,
    raw: row,
  };
}

export async function searchSpocketProducts(
  query: string,
  credentials?: SupplierCredentials | null,
  page = 1,
): Promise<ExternalCatalogProduct[]> {
  if (!useLiveSupplierApi("spocket", credentials)) return mockCatalog(query);
  try {
    const json = await spocketFetch("/products", {
      query: { q: query, page, per_page: 24 },
      credentials,
    });
    const rows = Array.isArray(json.data)
      ? (json.data as Record<string, unknown>[])
      : Array.isArray(json.products)
        ? (json.products as Record<string, unknown>[])
        : [];
    return rows.map(mapSpocketProduct);
  } catch (error) {
    if (!shouldFallbackToMock()) throw error;
    return mockCatalog(query);
  }
}

export async function getSpocketProduct(
  externalProductId: string,
  credentials?: SupplierCredentials | null,
): Promise<ExternalCatalogProduct | null> {
  if (
    !useLiveSupplierApi("spocket", credentials) ||
    externalProductId.startsWith("SPK-MOCK-")
  ) {
    return (
      mockCatalog("detail").find((p) => p.externalProductId === externalProductId) ??
      mockCatalog(externalProductId)[0] ??
      null
    );
  }
  try {
    const json = await spocketFetch(
      `/products/${encodeURIComponent(externalProductId)}`,
      { credentials },
    );
    const row = (json.data ?? json.product ?? json) as Record<string, unknown>;
    return mapSpocketProduct(row);
  } catch (error) {
    if (!shouldFallbackToMock()) throw error;
    return mockCatalog(externalProductId)[0] ?? null;
  }
}

export async function syncSpocketInventory(
  externalProductId: string,
  credentials?: SupplierCredentials | null,
): Promise<ExternalInventorySnapshot> {
  const product = await getSpocketProduct(externalProductId, credentials);
  return {
    externalProductId,
    externalVariantId: product?.externalVariantId ?? null,
    externalSku: product?.externalSku ?? null,
    priceUsdt: product?.priceUsdt ?? null,
    stockQuantity: product?.stockQuantity ?? null,
    raw: product?.raw ?? {},
  };
}

export async function createSpocketOrder(
  request: SupplierFulfillmentRequest,
  credentials?: SupplierCredentials | null,
): Promise<SupplierFulfillmentResult> {
  if (!useLiveSupplierApi("spocket", credentials)) {
    return {
      ok: true,
      supplierOrderRef: `SPK-MOCK-ORD-${request.orderId.slice(0, 8)}`,
      status: "submitted",
      raw: { mock: true, request },
    };
  }
  try {
    const json = await spocketFetch("/orders", {
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
    const ref = String(json.id ?? json.order_id ?? "");
    return {
      ok: Boolean(ref),
      supplierOrderRef: ref || null,
      status: String(json.status ?? (ref ? "submitted" : "failed")),
      raw: json,
      error: ref ? undefined : "Spocket create order returned no id.",
    };
  } catch (error) {
    return {
      ok: false,
      supplierOrderRef: null,
      status: "failed",
      raw: {},
      error: error instanceof Error ? error.message : "Spocket order failed",
    };
  }
}
