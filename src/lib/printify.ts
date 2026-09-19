/**
 * Printify API client for Eisy Myanmar.
 *
 * Env:
 * - PRINTIFY_API_KEY (required for live calls)
 * - PRINTIFY_SHOP_ID (required for shop-scoped product/order calls)
 * - PRINTIFY_API_BASE (optional, default https://api.printify.com/v1)
 *
 * Docs: https://developers.printify.com/
 */

export type PrintifyShop = {
  id: number | string;
  title?: string;
  sales_channel?: string;
};

export type PrintifyProductVariant = {
  id: number | string;
  sku?: string | null;
  title?: string | null;
  price?: number | null;
  is_enabled?: boolean;
  is_available?: boolean;
};

export type PrintifyProduct = {
  id: string;
  title: string;
  description?: string | null;
  tags?: string[];
  images?: Array<{ src?: string; variant_ids?: number[] } | string>;
  variants?: PrintifyProductVariant[];
  visible?: boolean;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
};

export type PrintifyAddressTo = {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  country: string;
  region?: string;
  address1: string;
  address2?: string;
  city: string;
  zip: string;
};

export type PrintifyOrderLineItem = {
  product_id: string;
  variant_id: number | string;
  quantity: number;
};

export type PrintifyCreateOrderInput = {
  external_id: string;
  line_items: PrintifyOrderLineItem[];
  address_to: PrintifyAddressTo;
  shipping_method?: number;
  is_printify_express?: boolean;
  send_shipping_notification?: boolean;
  /** When true (default), also call send_to_production after create. */
  sendToProduction?: boolean;
};

export type PrintifyOrder = {
  id: string;
  status?: string;
  external_id?: string;
  [key: string]: unknown;
};

export type PrintifyConfig = {
  apiKey: string;
  shopId: string;
  baseUrl: string;
};

export class PrintifyConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrintifyConfigError";
  }
}

export class PrintifyApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "PrintifyApiError";
    this.status = status;
    this.body = body;
  }
}

const DEFAULT_BASE = "https://api.printify.com/v1";
const USER_AGENT = "EisyMyanmar/1.0 (+https://eisy.myanmar)";

/**
 * Resolve Printify API key + shop id from environment (or optional overrides).
 * Throws PrintifyConfigError when required values are missing.
 */
export function getPrintifyConfig(overrides?: {
  apiKey?: string | null;
  shopId?: string | null;
  baseUrl?: string | null;
}): PrintifyConfig {
  const apiKey =
    overrides?.apiKey?.trim() || process.env.PRINTIFY_API_KEY?.trim() || "";
  const shopId =
    overrides?.shopId?.trim() || process.env.PRINTIFY_SHOP_ID?.trim() || "";
  const baseUrl = (
    overrides?.baseUrl?.trim() ||
    process.env.PRINTIFY_API_BASE?.trim() ||
    DEFAULT_BASE
  ).replace(/\/$/, "");

  if (!apiKey) {
    throw new PrintifyConfigError(
      "PRINTIFY_API_KEY is not set. Add it to your environment to use the Printify API.",
    );
  }
  if (!shopId) {
    throw new PrintifyConfigError(
      "PRINTIFY_SHOP_ID is not set. Add your Printify shop id to the environment.",
    );
  }

  return { apiKey, shopId, baseUrl };
}

/** Soft check — does not throw. */
export function isPrintifyConfigured(overrides?: {
  apiKey?: string | null;
  shopId?: string | null;
}): boolean {
  try {
    getPrintifyConfig(overrides);
    return true;
  } catch {
    return false;
  }
}

type PrintifyRequestOptions = {
  method?: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  /** Skip shop id requirement (e.g. GET /shops.json). */
  requireShop?: boolean;
  apiKey?: string | null;
  shopId?: string | null;
  baseUrl?: string | null;
};

/**
 * Low-level authenticated request to the Printify API.
 */
export async function printifyRequest<T = unknown>(
  path: string,
  options: PrintifyRequestOptions = {},
): Promise<T> {
  const requireShop = options.requireShop !== false;
  let apiKey: string;
  let shopId: string;
  let baseUrl: string;

  if (requireShop) {
    const config = getPrintifyConfig({
      apiKey: options.apiKey,
      shopId: options.shopId,
      baseUrl: options.baseUrl,
    });
    apiKey = config.apiKey;
    shopId = config.shopId;
    baseUrl = config.baseUrl;
  } else {
    apiKey =
      options.apiKey?.trim() || process.env.PRINTIFY_API_KEY?.trim() || "";
    if (!apiKey) {
      throw new PrintifyConfigError(
        "PRINTIFY_API_KEY is not set. Add it to your environment to use the Printify API.",
      );
    }
    shopId =
      options.shopId?.trim() || process.env.PRINTIFY_SHOP_ID?.trim() || "";
    baseUrl = (
      options.baseUrl?.trim() ||
      process.env.PRINTIFY_API_BASE?.trim() ||
      DEFAULT_BASE
    ).replace(/\/$/, "");
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  // Allow callers to use `{shop_id}` placeholder in paths.
  const resolvedPath = normalizedPath.replace(
    /\{shop_id\}/gi,
    encodeURIComponent(shopId),
  );

  const url = new URL(`${baseUrl}${resolvedPath}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value != null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "User-Agent": USER_AGENT,
      },
      body:
        options.body != null ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
    });
  } catch (error) {
    throw new PrintifyApiError(
      error instanceof Error
        ? `Printify network error: ${error.message}`
        : "Printify network error.",
      0,
    );
  }

  const text = await response.text();
  let json: unknown = {};
  if (text) {
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      json = { raw: text };
    }
  }

  if (!response.ok) {
    const record = (json ?? {}) as Record<string, unknown>;
    const message = String(
      record.message ??
        record.error ??
        (Array.isArray(record.errors)
          ? JSON.stringify(record.errors)
          : `Printify HTTP ${response.status}`),
    );
    throw new PrintifyApiError(message, response.status, json);
  }

  return json as T;
}

/** GET /shops.json — list shops for the authenticated merchant. */
export async function listPrintifyShops(apiKey?: string | null): Promise<PrintifyShop[]> {
  const data = await printifyRequest<PrintifyShop[] | { data?: PrintifyShop[] }>(
    "/shops.json",
    { requireShop: false, apiKey },
  );
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.data)) return data.data;
  return [];
}

export type FetchPrintifyProductsOptions = {
  page?: number;
  limit?: number;
  apiKey?: string | null;
  shopId?: string | null;
};

type ProductListResponse = {
  data?: PrintifyProduct[];
  current_page?: number;
  last_page?: number;
  total?: number;
};

/** GET /shops/{shop_id}/products.json */
export async function fetchPrintifyProducts(
  options: FetchPrintifyProductsOptions = {},
): Promise<{
  products: PrintifyProduct[];
  page: number;
  lastPage: number;
  total: number;
}> {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
  const data = await printifyRequest<ProductListResponse | PrintifyProduct[]>(
    "/shops/{shop_id}/products.json",
    {
      query: { page, limit },
      apiKey: options.apiKey,
      shopId: options.shopId,
    },
  );

  if (Array.isArray(data)) {
    return { products: data, page, lastPage: page, total: data.length };
  }

  const products = Array.isArray(data.data) ? data.data : [];
  return {
    products,
    page: Number(data.current_page ?? page) || page,
    lastPage: Number(data.last_page ?? page) || page,
    total: Number(data.total ?? products.length) || products.length,
  };
}

/** GET /shops/{shop_id}/products/{product_id}.json */
export async function fetchPrintifyProduct(
  productId: string,
  options: { apiKey?: string | null; shopId?: string | null } = {},
): Promise<PrintifyProduct> {
  if (!productId?.trim()) {
    throw new PrintifyConfigError("productId is required.");
  }
  return printifyRequest<PrintifyProduct>(
    `/shops/{shop_id}/products/${encodeURIComponent(productId.trim())}.json`,
    { apiKey: options.apiKey, shopId: options.shopId },
  );
}

export type CreatePrintifyOrderResult = {
  order: PrintifyOrder;
  sentToProduction: boolean;
  productionError?: string;
};

/**
 * POST /shops/{shop_id}/orders.json
 * Optionally sends the order to production immediately after create.
 */
export async function createPrintifyOrder(
  input: PrintifyCreateOrderInput,
  options: { apiKey?: string | null; shopId?: string | null } = {},
): Promise<CreatePrintifyOrderResult> {
  if (!input.external_id?.trim()) {
    throw new PrintifyConfigError("external_id is required for Printify orders.");
  }
  if (!input.line_items?.length) {
    throw new PrintifyConfigError("At least one line_item is required.");
  }
  if (!input.address_to?.address1?.trim() || !input.address_to?.country?.trim()) {
    throw new PrintifyConfigError(
      "address_to with address1 and country is required.",
    );
  }

  const body = {
    external_id: input.external_id.trim(),
    line_items: input.line_items.map((line) => ({
      product_id: String(line.product_id),
      variant_id:
        typeof line.variant_id === "number"
          ? line.variant_id
          : Number(line.variant_id) || line.variant_id,
      quantity: Math.max(1, Math.floor(Number(line.quantity) || 1)),
    })),
    shipping_method: input.shipping_method ?? 1,
    is_printify_express: Boolean(input.is_printify_express),
    send_shipping_notification: Boolean(input.send_shipping_notification),
    address_to: {
      first_name: input.address_to.first_name || "Customer",
      last_name: input.address_to.last_name || "Buyer",
      email: input.address_to.email || "buyer@example.com",
      phone: input.address_to.phone ?? "",
      country: input.address_to.country,
      region: input.address_to.region ?? "",
      address1: input.address_to.address1,
      address2: input.address_to.address2 ?? "",
      city: input.address_to.city || "Unknown",
      zip: input.address_to.zip || "00000",
    },
  };

  const order = await printifyRequest<PrintifyOrder>(
    "/shops/{shop_id}/orders.json",
    {
      method: "POST",
      body,
      apiKey: options.apiKey,
      shopId: options.shopId,
    },
  );

  const orderId = String(order.id ?? "");
  const shouldSend = input.sendToProduction !== false;
  let sentToProduction = false;
  let productionError: string | undefined;

  if (shouldSend && orderId) {
    try {
      await sendPrintifyOrderToProduction(orderId, options);
      sentToProduction = true;
    } catch (error) {
      productionError =
        error instanceof Error
          ? error.message
          : "Failed to send Printify order to production.";
    }
  }

  return { order, sentToProduction, productionError };
}

/** POST /shops/{shop_id}/orders/{order_id}/send_to_production.json */
export async function sendPrintifyOrderToProduction(
  orderId: string,
  options: { apiKey?: string | null; shopId?: string | null } = {},
): Promise<unknown> {
  if (!orderId?.trim()) {
    throw new PrintifyConfigError("orderId is required.");
  }
  return printifyRequest(
    `/shops/{shop_id}/orders/${encodeURIComponent(orderId.trim())}/send_to_production.json`,
    { method: "POST", apiKey: options.apiKey, shopId: options.shopId },
  );
}

/**
 * Build a Printify address from a marketplace shipping address blob.
 */
export function printifyAddressFromShipping(
  address: Record<string, unknown> | null | undefined,
  fallbackEmail?: string | null,
): PrintifyAddressTo {
  const fullName = String(
    address?.full_name ?? address?.name ?? "Customer Buyer",
  ).trim();
  const parts = fullName.split(/\s+/).filter(Boolean);
  const first_name = parts[0] || "Customer";
  const last_name = parts.slice(1).join(" ") || "Buyer";

  return {
    first_name,
    last_name,
    email: String(
      address?.email ?? fallbackEmail ?? "buyer@example.com",
    ),
    phone: address?.phone ? String(address.phone) : "",
    country: String(
      address?.country ?? address?.country_code ?? "MM",
    )
      .trim()
      .toUpperCase()
      .slice(0, 2),
    region: address?.region ? String(address.region) : "",
    address1: String(address?.line1 ?? address?.address1 ?? ""),
    address2: address?.line2 ? String(address.line2) : "",
    city: String(address?.city ?? ""),
    zip: String(address?.postal_code ?? address?.zip ?? ""),
  };
}

/**
 * Submit a Printify order when a buyer completes a purchase.
 * Maps marketplace order + line items into the Printify Orders API.
 */
export async function submitPrintifyOrderOnPurchase(input: {
  orderId: string;
  shippingAddress?: Record<string, unknown> | null;
  buyerEmail?: string | null;
  lines: Array<{
    productId: string;
    variantId: string | number;
    quantity: number;
  }>;
  apiKey?: string | null;
  shopId?: string | null;
  sendToProduction?: boolean;
}): Promise<CreatePrintifyOrderResult> {
  if (!input.orderId?.trim()) {
    throw new PrintifyConfigError("orderId is required.");
  }
  if (!input.lines?.length) {
    throw new PrintifyConfigError(
      "At least one Printify line item is required to submit an order.",
    );
  }

  return createPrintifyOrder(
    {
      external_id: input.orderId.trim(),
      line_items: input.lines.map((line) => ({
        product_id: String(line.productId),
        variant_id: line.variantId,
        quantity: line.quantity,
      })),
      address_to: printifyAddressFromShipping(
        input.shippingAddress,
        input.buyerEmail,
      ),
      sendToProduction: input.sendToProduction,
    },
    { apiKey: input.apiKey, shopId: input.shopId },
  );
}
