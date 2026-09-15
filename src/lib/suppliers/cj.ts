import type {
  ExternalCatalogProduct,
  ExternalInventorySnapshot,
  SupplierCredentials,
  SupplierFulfillmentRequest,
  SupplierFulfillmentResult,
} from "@/lib/suppliers/types";
import { supplierIntegrationsMode } from "@/lib/suppliers/types";

const CJ_API_BASE =
  process.env.CJ_API_BASE?.trim() ||
  "https://developers.cjdropshipping.com/api2.0/v1";

type CjJson = Record<string, unknown>;

function mockCatalog(query: string): ExternalCatalogProduct[] {
  const q = query.trim() || "gadget";
  return [1, 2, 3].map((n) => ({
    providerKind: "cj_dropshipping" as const,
    externalProductId: `CJ-MOCK-${q.slice(0, 12).toUpperCase()}-${n}`,
    externalVariantId: `CJ-VID-MOCK-${n}`,
    externalSku: `CJ-SKU-MOCK-${n}`,
    name: `CJ ${q} sample #${n}`,
    description: `Mock CJ Dropshipping catalog item for “${q}”. Connect CJ_API_KEY / CJ_ACCESS_TOKEN for live search.`,
    imageUrl: null,
    images: [],
    priceUsdt: Number((4.5 + n * 1.25).toFixed(2)),
    compareAtPriceUsdt: Number((7 + n * 1.5).toFixed(2)),
    stockQuantity: 50 * n,
    warehouseCountry: "CN",
    shippingDaysMin: 5,
    shippingDaysMax: 15,
    raw: { mock: true, query: q, n },
  }));
}

async function cjFetch(
  path: string,
  options: {
    method?: string;
    query?: Record<string, string | number | undefined>;
    body?: unknown;
    credentials?: SupplierCredentials | null;
  } = {},
): Promise<CjJson> {
  const token =
    options.credentials?.accessToken?.trim() ||
    process.env.CJ_ACCESS_TOKEN?.trim() ||
    "";
  const apiKey =
    options.credentials?.apiKey?.trim() || process.env.CJ_API_KEY?.trim() || "";

  if (!token && !apiKey && supplierIntegrationsMode() === "live") {
    throw new Error("CJ credentials missing. Set CJ_ACCESS_TOKEN or CJ_API_KEY.");
  }

  const url = new URL(`${CJ_API_BASE.replace(/\/$/, "")}${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value != null && value !== "") url.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (token) headers["CJ-Access-Token"] = token;
  if (apiKey) headers["CJ-API-KEY"] = apiKey;

  const response = await fetch(url.toString(), {
    method: options.method ?? "GET",
    headers,
    body: options.body != null ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  const text = await response.text();
  let json: CjJson = {};
  try {
    json = text ? (JSON.parse(text) as CjJson) : {};
  } catch {
    throw new Error(`CJ API returned non-JSON (${response.status})`);
  }

  if (!response.ok) {
    throw new Error(
      `CJ API ${response.status}: ${String(json.message ?? json.error ?? text).slice(0, 240)}`,
    );
  }

  return json;
}

function mapCjProduct(row: Record<string, unknown>): ExternalCatalogProduct {
  const imagesRaw = row.productImage || row.productImgList || row.images || [];
  const images = Array.isArray(imagesRaw)
    ? imagesRaw.map((x) => String(x)).filter(Boolean)
    : typeof imagesRaw === "string" && imagesRaw
      ? [imagesRaw]
      : [];
  const price = Number(
    row.sellPrice ?? row.discountPrice ?? row.productPrice ?? row.price ?? 0,
  );
  return {
    providerKind: "cj_dropshipping",
    externalProductId: String(row.pid ?? row.productId ?? row.id ?? ""),
    externalVariantId: String(
      row.vid ?? row.variantId ?? row.productSku ?? "",
    ) || null,
    externalSku: String(row.productSku ?? row.sku ?? "") || null,
    name: String(row.productNameEn ?? row.productName ?? row.name ?? "CJ product"),
    description:
      (row.description as string | null | undefined) ??
      (row.productNameEn as string | null | undefined) ??
      null,
    imageUrl: images[0] ?? null,
    images,
    priceUsdt: Number.isFinite(price) && price > 0 ? price : 1,
    compareAtPriceUsdt: null,
    stockQuantity:
      row.inventory != null && Number.isFinite(Number(row.inventory))
        ? Number(row.inventory)
        : null,
    warehouseCountry: String(row.warehouseCountryCode ?? row.countryCode ?? "CN"),
    shippingDaysMin: 5,
    shippingDaysMax: 18,
    raw: row,
  };
}

export async function searchCjProducts(
  query: string,
  credentials?: SupplierCredentials | null,
  page = 1,
): Promise<ExternalCatalogProduct[]> {
  if (supplierIntegrationsMode() === "mock") {
    return mockCatalog(query);
  }

  try {
    const json = await cjFetch("/product/list", {
      credentials,
      query: {
        keyWord: query || undefined,
        pageNum: page,
        pageSize: 20,
      },
    });
    const data = (json.data ?? json.result ?? {}) as Record<string, unknown>;
    const list = (data.list ?? data.content ?? data) as unknown;
    const rows = Array.isArray(list) ? list : [];
    return rows
      .map((row) => mapCjProduct(row as Record<string, unknown>))
      .filter((p) => p.externalProductId);
  } catch (error) {
    if (process.env.SUPPLIER_INTEGRATIONS_FALLBACK_MOCK === "0") throw error;
    return mockCatalog(query);
  }
}

export async function getCjProduct(
  externalProductId: string,
  credentials?: SupplierCredentials | null,
): Promise<ExternalCatalogProduct | null> {
  if (supplierIntegrationsMode() === "mock") {
    return (
      mockCatalog("detail").find((p) => p.externalProductId.includes("1")) ??
      mockCatalog(externalProductId)[0] ??
      null
    );
  }

  const json = await cjFetch("/product/query", {
    credentials,
    query: { pid: externalProductId },
  });
  const data = (json.data ?? json.result ?? json) as Record<string, unknown>;
  if (!data || typeof data !== "object") return null;
  const mapped = mapCjProduct(data);
  return mapped.externalProductId ? mapped : null;
}

export async function syncCjInventory(
  externalProductId: string,
  credentials?: SupplierCredentials | null,
): Promise<ExternalInventorySnapshot> {
  const product = await getCjProduct(externalProductId, credentials);
  if (!product) {
    throw new Error("CJ product not found for inventory sync.");
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

export async function createCjOrder(
  request: SupplierFulfillmentRequest,
  credentials?: SupplierCredentials | null,
): Promise<SupplierFulfillmentResult> {
  if (supplierIntegrationsMode() === "mock") {
    const ref = `CJ-MOCK-${request.orderId.slice(0, 8).toUpperCase()}`;
    return {
      ok: true,
      supplierOrderRef: ref,
      status: "submitted",
      raw: { mock: true, request },
    };
  }

  const products = request.lines.map((line) => ({
    vid: line.externalVariantId || line.externalSku || line.externalProductId,
    sku: line.externalSku,
    quantity: line.quantity,
    storeProductId: line.listingProductId,
    storeProductImg: line.imageUrl,
  }));

  if (products.some((p) => !p.vid)) {
    return {
      ok: false,
      supplierOrderRef: null,
      status: "failed",
      raw: {},
      error: "Missing CJ variant id (vid) on one or more lines.",
    };
  }

  try {
    const json = await cjFetch("/shopping/order/createOrderV3", {
      method: "POST",
      credentials,
      body: {
        orderNumber: request.orderNumber,
        shippingCustomerName: request.shipTo.fullName,
        shippingPhone: request.shipTo.phone ?? "",
        email: request.shipTo.email ?? "",
        shippingAddress: request.shipTo.line1,
        shippingAddress2: request.shipTo.line2 ?? "",
        shippingCity: request.shipTo.city,
        shippingProvince: request.shipTo.region ?? "",
        shippingZip: request.shipTo.postalCode ?? "",
        shippingCountryCode: request.shipTo.countryCode,
        shippingCountry: request.shipTo.countryCode,
        remark: request.note ?? `EISY order ${request.orderId}`,
        fromCountryCode: "CN",
        products,
      },
    });

    const data = (json.data ?? json.result ?? json) as Record<string, unknown>;
    const ref = String(
      data.orderId ?? data.orderNum ?? data.cjOrderId ?? data.id ?? "",
    );
    return {
      ok: Boolean(ref),
      supplierOrderRef: ref || null,
      status: ref ? "submitted" : "failed",
      raw: json,
      error: ref ? undefined : "CJ create order returned no order id.",
    };
  } catch (error) {
    return {
      ok: false,
      supplierOrderRef: null,
      status: "failed",
      raw: {},
      error: error instanceof Error ? error.message : "CJ create order failed.",
    };
  }
}
