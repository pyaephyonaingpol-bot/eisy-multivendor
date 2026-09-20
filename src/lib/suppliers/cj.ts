import type {
  ExternalCatalogProduct,
  ExternalInventorySnapshot,
  SupplierCredentials,
  SupplierFulfillmentRequest,
  SupplierFulfillmentResult,
} from "@/lib/suppliers/types";
import { useLiveSupplierApi } from "@/lib/suppliers/types";
import { shouldFallbackToMock } from "@/lib/suppliers/auth";

const CJ_API_BASE =
  process.env.CJ_API_BASE?.trim() ||
  "https://developers.cjdropshipping.com/api2.0/v1";

type CjJson = Record<string, unknown>;

/** Process-local access-token cache keyed by apiKey (or "env"). */
const accessTokenCache = new Map<
  string,
  { accessToken: string; refreshToken: string; expiresAtMs: number }
>();

function resolveCjAuth(credentials?: SupplierCredentials | null): {
  token: string;
  apiKey: string;
  refreshToken: string;
} {
  return {
    token:
      credentials?.accessToken?.trim() ||
      process.env.CJ_ACCESS_TOKEN?.trim() ||
      "",
    apiKey:
      credentials?.apiKey?.trim() || process.env.CJ_API_KEY?.trim() || "",
    refreshToken:
      credentials?.refreshToken?.trim() ||
      process.env.CJ_REFRESH_TOKEN?.trim() ||
      "",
  };
}

function credentialsHaveKey(credentials?: SupplierCredentials | null): boolean {
  return Boolean(
    credentials?.apiKey?.trim() ||
      credentials?.accessToken?.trim() ||
      process.env.CJ_API_KEY?.trim() ||
      process.env.CJ_ACCESS_TOKEN?.trim(),
  );
}

function mockCatalog(query: string): ExternalCatalogProduct[] {
  const q = query.trim() || "gadget";
  return [1, 2, 3].map((n) => {
    const seed = `cj-${q.slice(0, 8)}-${n}`.replace(/\s+/g, "-");
    const images = [
      `https://picsum.photos/seed/${seed}-a/800/800`,
      `https://picsum.photos/seed/${seed}-b/800/800`,
      `https://picsum.photos/seed/${seed}-c/800/800`,
    ];
    const base = Number((4.5 + n * 1.25).toFixed(2));
    return {
      providerKind: "cj_dropshipping" as const,
      externalProductId: `CJ-MOCK-${q.slice(0, 12).toUpperCase()}-${n}`,
      externalVariantId: `CJ-VID-MOCK-${n}-BLK`,
      externalSku: `CJ-SKU-MOCK-${n}-BLK`,
      name: `CJ ${q} sample #${n}`,
      description: [
        `Premium ${q} sourced via CJ Dropshipping (mock catalog).`,
        "",
        "Highlights",
        `• Warehouse: China (CN) with typical 5–15 day transit to Myanmar`,
        `• Pack includes charging cable and quick-start guide`,
        `• Suitable for dropship listings with regional supplier routes`,
        "",
        "Review this description in Preview before Import to Store — you can edit the copy and sell price.",
        "Connect CJ_API_KEY / CJ_ACCESS_TOKEN for live catalog data.",
      ].join("\n"),
      imageUrl: images[0],
      images,
      priceUsdt: base,
      compareAtPriceUsdt: Number((7 + n * 1.5).toFixed(2)),
      stockQuantity: 50 * n,
      warehouseCountry: "CN",
      shippingDaysMin: 5,
      shippingDaysMax: 15,
      variants: [
        {
          externalVariantId: `CJ-VID-MOCK-${n}-BLK`,
          externalSku: `CJ-SKU-MOCK-${n}-BLK`,
          label: "Black",
          priceUsdt: base,
          stockQuantity: 30 * n,
          imageUrl: images[0],
        },
        {
          externalVariantId: `CJ-VID-MOCK-${n}-WHT`,
          externalSku: `CJ-SKU-MOCK-${n}-WHT`,
          label: "White",
          priceUsdt: Number((base + 0.4).toFixed(2)),
          stockQuantity: 20 * n,
          imageUrl: images[1],
        },
        {
          externalVariantId: `CJ-VID-MOCK-${n}-BLU`,
          externalSku: `CJ-SKU-MOCK-${n}-BLU`,
          label: "Blue",
          priceUsdt: Number((base + 0.6).toFixed(2)),
          stockQuantity: 15 * n,
          imageUrl: images[2],
        },
      ],
      raw: { mock: true, query: q, n },
    };
  });
}

async function postCjAuth(
  path: string,
  body: Record<string, string>,
): Promise<CjJson> {
  const url = `${CJ_API_BASE.replace(/\/$/, "")}${path}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const text = await response.text();
  let json: CjJson = {};
  try {
    json = text ? (JSON.parse(text) as CjJson) : {};
  } catch {
    throw new Error(`CJ auth returned non-JSON (${response.status})`);
  }
  if (!response.ok) {
    throw new Error(
      `CJ auth ${response.status}: ${String(json.message ?? json.error ?? text).slice(0, 240)}`,
    );
  }
  // CJ wraps payloads as { code, result: true, data: { accessToken, ... } }
  const code = json.code;
  if (code != null && Number(code) !== 200 && String(code) !== "0") {
    throw new Error(
      `CJ auth error: ${String(json.message ?? json.errorMsg ?? code).slice(0, 240)}`,
    );
  }
  return json;
}

function readTokenPayload(json: CjJson): {
  accessToken: string;
  refreshToken: string;
  expiresAtMs: number;
} {
  const data = (json.data ?? json.result ?? json) as Record<string, unknown>;
  const accessToken = String(
    data.accessToken ?? data.access_token ?? "",
  ).trim();
  const refreshToken = String(
    data.refreshToken ?? data.refresh_token ?? "",
  ).trim();
  if (!accessToken) {
    throw new Error("CJ auth did not return an accessToken.");
  }
  const expiryRaw = String(
    data.accessTokenExpiryDate ?? data.accessTokenExpiry ?? "",
  ).trim();
  const parsedExpiry = expiryRaw ? Date.parse(expiryRaw) : NaN;
  // Default ~14 days with a 1h safety margin when expiry is missing.
  const expiresAtMs = Number.isFinite(parsedExpiry)
    ? parsedExpiry - 60 * 60 * 1000
    : Date.now() + 14 * 24 * 60 * 60 * 1000;
  return { accessToken, refreshToken, expiresAtMs };
}

/**
 * CJ product APIs require a `CJ-Access-Token`. When only an API key is stored
 * (Admin → Supplier APIs / CJ_API_KEY), exchange it for an access token via
 * `/authentication/getAccessToken`.
 */
async function ensureCjAccessToken(
  credentials?: SupplierCredentials | null,
): Promise<string> {
  const { token, apiKey, refreshToken } = resolveCjAuth(credentials);
  if (token) return token;

  const cacheKey = apiKey || refreshToken || "env";
  const cached = accessTokenCache.get(cacheKey);
  if (cached && cached.expiresAtMs > Date.now() && cached.accessToken) {
    return cached.accessToken;
  }

  if (refreshToken || cached?.refreshToken) {
    try {
      const json = await postCjAuth("/authentication/refreshAccessToken", {
        refreshToken: refreshToken || cached!.refreshToken,
      });
      const payload = readTokenPayload(json);
      accessTokenCache.set(cacheKey, payload);
      return payload.accessToken;
    } catch {
      // Fall through to apiKey exchange.
    }
  }

  if (!apiKey) {
    throw new Error(
      "CJ credentials missing. Save a platform CJ API key (Admin → Supplier APIs) or set CJ_ACCESS_TOKEN / CJ_API_KEY.",
    );
  }

  const json = await postCjAuth("/authentication/getAccessToken", {
    apiKey,
  });
  const payload = readTokenPayload(json);
  accessTokenCache.set(cacheKey, payload);
  return payload.accessToken;
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
  const accessToken = await ensureCjAccessToken(options.credentials);

  const url = new URL(`${CJ_API_BASE.replace(/\/$/, "")}${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value != null && value !== "") url.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "CJ-Access-Token": accessToken,
  };

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

  const code = json.code;
  if (code != null && Number(code) !== 200 && String(code) !== "0") {
    throw new Error(
      `CJ API error: ${String(json.message ?? json.errorMsg ?? code).slice(0, 240)}`,
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
    externalVariantId:
      String(row.vid ?? row.variantId ?? row.productSku ?? "") || null,
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
    warehouseCountry: String(
      row.warehouseCountryCode ?? row.countryCode ?? "CN",
    ),
    shippingDaysMin: 5,
    shippingDaysMax: 18,
    raw: row,
  };
}

function maybeMockFallback<T>(
  credentials: SupplierCredentials | null | undefined,
  error: unknown,
  fallback: () => T,
): T {
  // Never hide live failures behind mock when a key was configured.
  if (credentialsHaveKey(credentials) || !shouldFallbackToMock()) {
    throw error instanceof Error
      ? error
      : new Error("CJ live catalog request failed.");
  }
  return fallback();
}

export async function searchCjProducts(
  query: string,
  credentials?: SupplierCredentials | null,
  page = 1,
): Promise<ExternalCatalogProduct[]> {
  if (!useLiveSupplierApi("cj_dropshipping", credentials)) {
    return mockCatalog(query);
  }

  try {
    // Prefer listV2 (keyWord) — falls back to classic /product/list.
    let json: CjJson;
    try {
      json = await cjFetch("/product/listV2", {
        credentials,
        query: {
          keyWord: query || undefined,
          page,
          size: 20,
        },
      });
    } catch {
      json = await cjFetch("/product/list", {
        credentials,
        query: {
          productNameEn: query || undefined,
          keyWord: query || undefined,
          pageNum: page,
          pageSize: 20,
        },
      });
    }
    const data = (json.data ?? json.result ?? {}) as Record<string, unknown>;
    const list = (data.list ?? data.content ?? data) as unknown;
    const rows = Array.isArray(list) ? list : [];
    return rows
      .map((row) => mapCjProduct(row as Record<string, unknown>))
      .filter((p) => p.externalProductId);
  } catch (error) {
    return maybeMockFallback(credentials, error, () => mockCatalog(query));
  }
}

export async function getCjProduct(
  externalProductId: string,
  credentials?: SupplierCredentials | null,
): Promise<ExternalCatalogProduct | null> {
  if (!useLiveSupplierApi("cj_dropshipping", credentials)) {
    const nMatch = externalProductId.match(/-(\d+)$/);
    const n = nMatch ? Number(nMatch[1]) : 1;
    const queryHint =
      externalProductId
        .replace(/^CJ-MOCK-/i, "")
        .replace(/-\d+$/, "")
        .trim() || "detail";
    const catalog = mockCatalog(queryHint);
    const hit =
      catalog.find((p) => p.externalProductId === externalProductId) ??
      catalog.find((p) => p.externalProductId.endsWith(`-${n}`)) ??
      catalog[0] ??
      null;
    if (!hit) return null;
    return { ...hit, externalProductId };
  }

  try {
    const json = await cjFetch("/product/query", {
      credentials,
      query: { pid: externalProductId },
    });
    const data = (json.data ?? json.result ?? json) as Record<string, unknown>;
    if (!data || typeof data !== "object") return null;
    const mapped = mapCjProduct(data);
    return mapped.externalProductId ? mapped : null;
  } catch (error) {
    return maybeMockFallback(credentials, error, () => {
      return (
        mockCatalog(externalProductId).find(
          (p) => p.externalProductId === externalProductId,
        ) ??
        mockCatalog(externalProductId)[0] ??
        null
      );
    });
  }
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
  if (!useLiveSupplierApi("cj_dropshipping", credentials)) {
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
