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

function isCjSuccessCode(code: unknown): boolean {
  if (code == null) return true;
  const n = Number(code);
  if (Number.isFinite(n) && (n === 200 || n === 0)) return true;
  const s = String(code);
  return s === "200" || s === "0" || s.toLowerCase() === "ok";
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
  if (!isCjSuccessCode(json.code)) {
    throw new Error(
      `CJ auth error: ${String(json.message ?? json.errorMsg ?? json.code).slice(0, 240)}`,
    );
  }
  return json;
}

function readTokenPayload(json: CjJson): {
  accessToken: string;
  refreshToken: string;
  expiresAtMs: number;
} {
  const data = (json.data ??
    (typeof json.result === "object" && json.result !== null
      ? json.result
      : json)) as Record<string, unknown>;
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
  const expiresAtMs = Number.isFinite(parsedExpiry)
    ? parsedExpiry - 60 * 60 * 1000
    : Date.now() + 14 * 24 * 60 * 60 * 1000;
  return { accessToken, refreshToken, expiresAtMs };
}

/**
 * CJ product APIs require a `CJ-Access-Token`. When only an API key is stored
 * (Admin → Supplier APIs / CJ_API_KEY), exchange it for an access token via
 * `/authentication/getAccessToken`.
 *
 * If a stored access token later returns auth errors, callers should clear it
 * and retry with the API key (see {@link cjFetch}).
 */
async function ensureCjAccessToken(
  credentials?: SupplierCredentials | null,
  options?: { forceRefresh?: boolean },
): Promise<string> {
  const { token, apiKey, refreshToken } = resolveCjAuth(credentials);
  const cacheKey = apiKey || refreshToken || token || "env";

  if (!options?.forceRefresh && token) {
    return token;
  }

  if (!options?.forceRefresh) {
    const cached = accessTokenCache.get(cacheKey);
    if (cached && cached.expiresAtMs > Date.now() && cached.accessToken) {
      return cached.accessToken;
    }
  } else {
    accessTokenCache.delete(cacheKey);
  }

  const tryRefresh = refreshToken || accessTokenCache.get(cacheKey)?.refreshToken;
  if (tryRefresh) {
    try {
      const json = await postCjAuth("/authentication/refreshAccessToken", {
        refreshToken: tryRefresh,
      });
      const payload = readTokenPayload(json);
      accessTokenCache.set(cacheKey, payload);
      return payload.accessToken;
    } catch {
      // Fall through to apiKey exchange.
    }
  }

  if (!apiKey) {
    if (token && !options?.forceRefresh) return token;
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

function isAuthFailure(json: CjJson, status: number): boolean {
  if (status === 401 || status === 403) return true;
  const code = Number(json.code);
  // CJ uses various auth-related business codes; message is the reliable signal.
  const message = String(json.message ?? json.errorMsg ?? "").toLowerCase();
  return (
    message.includes("token") ||
    message.includes("unauthorized") ||
    message.includes("login") ||
    message.includes("auth") ||
    code === 1600001 ||
    code === 1600002 ||
    code === 1600003
  );
}

async function cjFetch(
  path: string,
  options: {
    method?: string;
    query?: Record<string, string | number | boolean | undefined>;
    body?: unknown;
    credentials?: SupplierCredentials | null;
    _retriedAuth?: boolean;
  } = {},
): Promise<CjJson> {
  const accessToken = await ensureCjAccessToken(options.credentials, {
    forceRefresh: Boolean(options._retriedAuth),
  });

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

  // Expired/invalid stored token → re-exchange API key once and retry.
  if (
    !options._retriedAuth &&
    credentialsHaveKey(options.credentials) &&
    isAuthFailure(json, response.status)
  ) {
    const { apiKey } = resolveCjAuth(options.credentials);
    if (apiKey) {
      return cjFetch(path, { ...options, _retriedAuth: true });
    }
  }

  if (!response.ok) {
    throw new Error(
      `CJ API ${response.status}: ${String(json.message ?? json.error ?? text).slice(0, 240)}`,
    );
  }

  if (!isCjSuccessCode(json.code)) {
    throw new Error(
      `CJ API error: ${String(json.message ?? json.errorMsg ?? json.code).slice(0, 240)}`,
    );
  }

  return json;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function collectImages(row: Record<string, unknown>): string[] {
  const candidates = [
    row.bigImage,
    row.productImage,
    row.productImageSet,
    row.productImgList,
    row.images,
  ];
  const out: string[] = [];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        const url = String(item ?? "").trim();
        if (url) out.push(url);
      }
    } else if (typeof candidate === "string" && candidate.trim()) {
      out.push(candidate.trim());
    }
  }
  return [...new Set(out)];
}

function mapCjProduct(row: Record<string, unknown>): ExternalCatalogProduct {
  const images = collectImages(row);
  const price = Number(
    row.nowPrice ??
      row.discountPrice ??
      row.sellPrice ??
      row.productPrice ??
      row.price ??
      0,
  );
  const stockRaw =
    row.warehouseInventoryNum ??
    row.totalVerifiedInventory ??
    row.inventory ??
    row.stock;
  const externalProductId = String(
    row.pid ?? row.productId ?? row.id ?? "",
  ).trim();

  return {
    providerKind: "cj_dropshipping",
    externalProductId,
    externalVariantId:
      String(row.vid ?? row.variantId ?? row.productSku ?? row.sku ?? "").trim() ||
      null,
    externalSku:
      String(row.productSku ?? row.sku ?? row.spu ?? "").trim() || null,
    name: String(
      row.productNameEn ?? row.nameEn ?? row.productName ?? row.name ?? "CJ product",
    ),
    description:
      (row.description as string | null | undefined) ??
      (row.productNameEn as string | null | undefined) ??
      (row.nameEn as string | null | undefined) ??
      null,
    imageUrl: images[0] ?? null,
    images,
    priceUsdt: Number.isFinite(price) && price > 0 ? price : 1,
    compareAtPriceUsdt: null,
    stockQuantity:
      stockRaw != null && Number.isFinite(Number(stockRaw))
        ? Number(stockRaw)
        : null,
    warehouseCountry: String(
      row.warehouseCountryCode ??
        row.countryCode ??
        row.warehouseCountry ??
        "CN",
    ),
    shippingDaysMin: 5,
    shippingDaysMax: 18,
    raw: row,
  };
}

/**
 * CJ listV2 returns:
 *   data.content[] → { productList: Product[], ... }
 * Classic list returns:
 *   data.list: Product[]
 */
function extractCjProductRows(json: CjJson): Record<string, unknown>[] {
  const data = asRecord(json.data) ?? asRecord(json.result) ?? {};
  const rows: Record<string, unknown>[] = [];

  const list = data.list;
  if (Array.isArray(list)) {
    for (const item of list) {
      const row = asRecord(item);
      if (row) rows.push(row);
    }
  }

  const content = data.content;
  if (Array.isArray(content)) {
    for (const block of content) {
      const blockRec = asRecord(block);
      if (!blockRec) continue;
      const productList = blockRec.productList;
      if (Array.isArray(productList)) {
        for (const item of productList) {
          const row = asRecord(item);
          if (row) rows.push(row);
        }
      } else if (
        blockRec.id ||
        blockRec.pid ||
        blockRec.productId ||
        blockRec.nameEn ||
        blockRec.productNameEn
      ) {
        // Some payloads may flatten products directly into content[].
        rows.push(blockRec);
      }
    }
  }

  // Rare: data itself is an array of products.
  if (rows.length === 0 && Array.isArray(json.data)) {
    for (const item of json.data) {
      const row = asRecord(item);
      if (row) rows.push(row);
    }
  }

  return rows;
}

function maybeMockFallback<T>(
  credentials: SupplierCredentials | null | undefined,
  error: unknown,
  fallback: () => T,
): T {
  if (credentialsHaveKey(credentials) || !shouldFallbackToMock()) {
    throw error instanceof Error
      ? error
      : new Error("CJ live catalog request failed.");
  }
  return fallback();
}

/** Max page size allowed by CJ listV2 (`size` ≤ 100). */
const CJ_LIST_V2_PAGE_SIZE = 100;
/** Classic list allows up to 200; keep 100 for balanced latency. */
const CJ_LIST_V1_PAGE_SIZE = 100;
/** Soft target for a rich first-page catalog response. */
const CJ_SEARCH_TARGET_RESULTS = 180;
/** Extra listV2 pages to pull for the requested page window. */
const CJ_SEARCH_MAX_EXTRA_PAGES = 2;

const CJ_KEYWORD_SYNONYMS: Record<string, string[]> = {
  earbud: ["earbuds", "earphone", "earphones", "headset", "headphones"],
  earbuds: ["earbud", "earphone", "earphones", "headset", "headphones"],
  earphone: ["earphones", "earbuds", "earbud", "headset", "headphones"],
  earphones: ["earphone", "earbuds", "earbud", "headset", "headphones"],
  headphone: ["headphones", "headset", "earbuds", "earphones"],
  headphones: ["headphone", "headset", "earbuds", "earphones"],
  phone: ["smartphone", "mobile phone", "cellphone"],
  watch: ["smartwatch", "wristwatch"],
  charger: ["charging cable", "usb charger", "fast charger"],
  cable: ["usb cable", "charging cable"],
  case: ["phone case", "protective case"],
  lamp: ["led lamp", "desk lamp", "light"],
  light: ["led light", "lamp"],
  bag: ["backpack", "handbag", "tote bag"],
  shoe: ["shoes", "sneakers"],
  shoes: ["shoe", "sneakers"],
};

/**
 * Expand a user query into related CJ keywords (singular/plural, synonyms,
 * leading token) so sparse exact matches still yield a rich catalog.
 */
export function expandCjSearchKeywords(query: string): string[] {
  const raw = query.trim();
  if (!raw) return [""];

  const lower = raw.toLowerCase().replace(/\s+/g, " ");
  const variants = new Set<string>([raw, lower]);

  // Singular / plural variants.
  if (lower.endsWith("ies") && lower.length > 4) {
    variants.add(`${lower.slice(0, -3)}y`);
  } else if (lower.endsWith("es") && lower.length > 4) {
    variants.add(lower.slice(0, -2));
  } else if (lower.endsWith("s") && lower.length > 3) {
    variants.add(lower.slice(0, -1));
  } else {
    variants.add(`${lower}s`);
  }
  if (lower.endsWith("y") && !/[aeiou]y$/i.test(lower)) {
    variants.add(`${lower.slice(0, -1)}ies`);
  }

  // Synonym expansion for common marketplace terms.
  for (const [key, alts] of Object.entries(CJ_KEYWORD_SYNONYMS)) {
    if (lower === key || lower.includes(key)) {
      for (const alt of alts) variants.add(alt);
    }
  }

  // Broader match on the first meaningful token of a multi-word query.
  const tokens = lower.split(" ").filter((token) => token.length >= 3);
  if (tokens.length > 1) {
    variants.add(tokens[0]!);
  }

  // Prefer original query first, then shorter/related forms.
  const ordered = [...variants].sort((a, b) => {
    if (a.toLowerCase() === lower) return -1;
    if (b.toLowerCase() === lower) return 1;
    return a.length - b.length;
  });

  // Cap variants to keep API usage reasonable.
  return ordered.slice(0, 5);
}

function productKey(row: Record<string, unknown>): string {
  return String(row.pid ?? row.productId ?? row.id ?? "").trim();
}

function dedupeCjRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const seen = new Set<string>();
  const out: Record<string, unknown>[] = [];
  for (const row of rows) {
    const key = productKey(row);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function readTotalPages(json: CjJson): number | null {
  const data = asRecord(json.data) ?? asRecord(json.result) ?? {};
  const totalPages = Number(data.totalPages ?? data.totalPage ?? 0);
  if (Number.isFinite(totalPages) && totalPages > 0) return totalPages;
  const total = Number(data.totalRecords ?? data.total ?? 0);
  const pageSize = Number(data.pageSize ?? data.size ?? CJ_LIST_V2_PAGE_SIZE);
  if (Number.isFinite(total) && total > 0 && pageSize > 0) {
    return Math.ceil(total / pageSize);
  }
  return null;
}

async function fetchCjListV2Page(
  credentials: SupplierCredentials | null | undefined,
  keyWord: string,
  page: number,
  size = CJ_LIST_V2_PAGE_SIZE,
): Promise<{ rows: Record<string, unknown>[]; totalPages: number | null }> {
  const json = await cjFetch("/product/listV2", {
    credentials,
    query: {
      keyWord: keyWord || undefined,
      page,
      size,
      orderBy: 0, // best match
      isWarehouse: true, // include global warehouse inventory
    },
  });
  return {
    rows: extractCjProductRows(json),
    totalPages: readTotalPages(json),
  };
}

async function fetchCjListV1Page(
  credentials: SupplierCredentials | null | undefined,
  productNameEn: string,
  page: number,
  pageSize = CJ_LIST_V1_PAGE_SIZE,
): Promise<Record<string, unknown>[]> {
  const json = await cjFetch("/product/list", {
    credentials,
    query: {
      productNameEn: productNameEn || undefined,
      pageNum: page,
      pageSize,
    },
  });
  return extractCjProductRows(json);
}

/**
 * Pull one or more listV2 pages for a keyword until the target is met or
 * pages are exhausted.
 */
async function collectCjRowsForKeyword(
  credentials: SupplierCredentials | null | undefined,
  keyWord: string,
  startPage: number,
  target: number,
): Promise<Record<string, unknown>[]> {
  const collected: Record<string, unknown>[] = [];
  let page = Math.max(1, startPage);
  let pagesFetched = 0;
  let totalPages: number | null = null;

  while (collected.length < target && pagesFetched <= CJ_SEARCH_MAX_EXTRA_PAGES) {
    if (totalPages != null && page > totalPages) break;
    const result = await fetchCjListV2Page(credentials, keyWord, page);
    totalPages = result.totalPages ?? totalPages;
    if (result.rows.length === 0) break;
    collected.push(...result.rows);
    pagesFetched += 1;
    page += 1;
    if (result.rows.length < CJ_LIST_V2_PAGE_SIZE) break;
  }

  return collected;
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
    const keywords = expandCjSearchKeywords(query);
    const startPage = Math.max(1, page);
    const allRows: Record<string, unknown>[] = [];

    // Primary keyword: multi-page listV2 for a dense first screen.
    const primary = keywords[0] ?? "";
    allRows.push(
      ...(await collectCjRowsForKeyword(
        credentials,
        primary,
        startPage,
        CJ_SEARCH_TARGET_RESULTS,
      )),
    );

    // Secondary keywords fill gaps when the exact term is sparse.
    if (dedupeCjRows(allRows).length < CJ_SEARCH_TARGET_RESULTS) {
      const extras = keywords.slice(1);
      await Promise.all(
        extras.map(async (keyword) => {
          if (!keyword || keyword === primary) return;
          try {
            const result = await fetchCjListV2Page(
              credentials,
              keyword,
              startPage,
              CJ_LIST_V2_PAGE_SIZE,
            );
            allRows.push(...result.rows);
          } catch {
            // Ignore secondary keyword failures; primary results still usable.
          }
        }),
      );
    }

    // Classic list (productNameEn) as an additional fuzzy channel.
    if (dedupeCjRows(allRows).length < CJ_SEARCH_TARGET_RESULTS) {
      try {
        const classic = await fetchCjListV1Page(
          credentials,
          primary,
          startPage,
          CJ_LIST_V1_PAGE_SIZE,
        );
        allRows.push(...classic);
      } catch {
        // Optional channel.
      }
    }

    // Absolute fallback when every keyword returned nothing.
    if (dedupeCjRows(allRows).length === 0 && primary) {
      try {
        const classic = await fetchCjListV1Page(
          credentials,
          primary,
          startPage,
          CJ_LIST_V1_PAGE_SIZE,
        );
        allRows.push(...classic);
      } catch {
        // Handled by outer catch / empty return.
      }
    }

    return dedupeCjRows(allRows)
      .map((row) => mapCjProduct(row))
      .filter((p) => Boolean(p.externalProductId));
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
    const data =
      asRecord(json.data) ??
      asRecord(json.result) ??
      asRecord(json) ??
      null;
    if (!data) return null;
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

    const data =
      asRecord(json.data) ?? asRecord(json.result) ?? asRecord(json) ?? {};
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
