import { createServiceClient } from "@/lib/supabase/admin";
import {
  buildSupplierFulfillmentRpcArgs,
  mapSupplierFulfillmentStatus,
} from "@/lib/orders/fulfillment-sync";
import { resolveAdapterKindFromProvider } from "@/lib/suppliers/auth";
import type { ExternalSupplierKind } from "@/lib/suppliers/types";

export type NormalizedSupplierWebhook = {
  provider: ExternalSupplierKind | "unknown";
  orderId: string | null;
  supplierOrderRef: string | null;
  supplierStatus: string | null;
  trackingNumber: string | null;
  trackingCarrier: string | null;
  trackingUrl: string | null;
  raw: Record<string, unknown>;
};

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function dig(obj: Record<string, unknown>, path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/**
 * Normalize provider-specific webhook payloads into a common update shape.
 */
export function normalizeSupplierWebhookPayload(
  providerHint: string,
  body: Record<string, unknown>,
): NormalizedSupplierWebhook {
  const provider =
    resolveAdapterKindFromProvider({
      providerKind: providerHint,
      providerSlug: providerHint,
    }) ?? "unknown";

  const data = (body.data ?? body.result ?? body.order ?? body) as Record<
    string,
    unknown
  >;

  // Common / EISY bridge fields
  let orderId = firstString(
    body.order_id,
    body.orderId,
    body.external_order_id,
    body.external_id,
    dig(data, ["external_id"]),
    dig(data, ["external_order_id"]),
    dig(data, ["merchant_order_id"]),
  );

  let supplierOrderRef = firstString(
    body.supplier_order_ref,
    body.supplierOrderRef,
    body.order_number,
    dig(data, ["id"]),
    dig(data, ["order_id"]),
    dig(data, ["orderId"]),
    dig(data, ["cjOrderId"]),
  );

  let supplierStatus = firstString(
    body.status,
    body.supplier_status,
    dig(data, ["status"]),
    dig(data, ["fulfillment_status"]),
    dig(data, ["state"]),
  );

  let trackingNumber = firstString(
    body.tracking_number,
    body.trackingNumber,
    dig(data, ["tracking_number"]),
    dig(data, ["trackingNumber"]),
    dig(data, ["tracking", "number"]),
    dig(data, ["shipments", "0", "tracking_number"]),
  );

  // Printful nested shipments
  if (!trackingNumber && Array.isArray(data.shipments)) {
    const shipment = data.shipments[0] as Record<string, unknown> | undefined;
    trackingNumber = firstString(
      shipment?.tracking_number,
      shipment?.trackingNumber,
    );
  }

  const trackingCarrier = firstString(
    body.tracking_carrier,
    body.trackingCarrier,
    dig(data, ["carrier"]),
    dig(data, ["tracking_company"]),
    dig(data, ["tracking", "carrier"]),
  );

  const trackingUrl = firstString(
    body.tracking_url,
    body.trackingUrl,
    dig(data, ["tracking_url"]),
    dig(data, ["trackingUrl"]),
    dig(data, ["tracking", "url"]),
  );

  // CJ Dropshipping specific
  if (provider === "cj_dropshipping") {
    supplierOrderRef =
      supplierOrderRef ||
      firstString(dig(data, ["orderId"]), dig(data, ["orderNum"]));
    trackingNumber =
      trackingNumber ||
      firstString(
        dig(data, ["trackNumber"]),
        dig(body, ["trackNumber"]),
        dig(data, ["logisticList", "0", "trackingNumber"]),
      );
    orderId =
      orderId ||
      firstString(dig(data, ["orderNumber"]), dig(body, ["orderNumber"]));
  }

  // Printify often nests address / status differently
  if (provider === "printify") {
    supplierStatus =
      supplierStatus || firstString(dig(data, ["status"]), body.type);
  }

  // If order id looks like our UUID in external_id / orderNumber fields above, keep it.
  // Otherwise leave null — caller may resolve by supplier_order_ref.
  if (orderId && !/^[0-9a-f-]{36}$/i.test(orderId)) {
    // Keep non-UUID as possible merchant reference; resolution happens later.
  }

  return {
    provider,
    orderId,
    supplierOrderRef,
    supplierStatus,
    trackingNumber,
    trackingCarrier,
    trackingUrl,
    raw: body,
  };
}

export async function resolveOrderIdFromSupplierRef(
  supplierOrderRef: string | null,
): Promise<string | null> {
  if (!supplierOrderRef) return null;
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("orders")
    .select("id")
    .eq("supplier_order_ref", supplierOrderRef)
    .maybeSingle();
  return data?.id ?? null;
}

export async function applySupplierTrackingUpdate(
  normalized: NormalizedSupplierWebhook,
): Promise<{ ok: true; orderId: string; status: string | null } | { ok: false; error: string }> {
  let orderId = normalized.orderId;
  if (orderId && !/^[0-9a-f-]{36}$/i.test(orderId)) {
    // Treat as possible supplier ref or merchant code — try lookup by supplier_order_ref
    const byRef = await resolveOrderIdFromSupplierRef(orderId);
    if (byRef) {
      orderId = byRef;
    } else if (normalized.supplierOrderRef) {
      orderId = await resolveOrderIdFromSupplierRef(normalized.supplierOrderRef);
    } else {
      orderId = null;
    }
  }

  if (!orderId) {
    orderId = await resolveOrderIdFromSupplierRef(normalized.supplierOrderRef);
  }

  if (!orderId) {
    return {
      ok: false,
      error:
        "Could not resolve marketplace order_id from webhook (need order_id/external_id UUID or known supplier_order_ref).",
    };
  }

  const args = buildSupplierFulfillmentRpcArgs({
    orderId,
    supplierOrderRef: normalized.supplierOrderRef,
    supplierStatus: normalized.supplierStatus,
    trackingNumber: normalized.trackingNumber,
    trackingCarrier: normalized.trackingCarrier,
    trackingUrl: normalized.trackingUrl,
    source: "supplier_webhook",
    payload: {
      provider: normalized.provider,
      mapped_status: mapSupplierFulfillmentStatus(normalized.supplierStatus),
      raw: normalized.raw,
    },
    note: `Supplier webhook (${normalized.provider})`,
  });

  const supabase = createServiceClient();
  const { error } = await supabase.rpc("sync_order_fulfillment", args);
  if (error) {
    return { ok: false, error: error.message };
  }

  return {
    ok: true,
    orderId,
    status: mapSupplierFulfillmentStatus(normalized.supplierStatus),
  };
}

export function verifySupplierWebhookSecret(
  request: Request,
  provider: string,
): boolean {
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const headerSecret =
    request.headers.get("x-eisy-webhook-secret")?.trim() ||
    request.headers.get("x-webhook-secret")?.trim() ||
    "";

  const cron = process.env.CRON_SECRET?.trim() || "";
  const shared = process.env.SUPPLIER_WEBHOOK_SECRET?.trim() || "";
  const providerSpecific =
    process.env[`SUPPLIER_WEBHOOK_SECRET_${provider.toUpperCase()}`]?.trim() ||
    "";

  const presented = bearer || headerSecret;
  if (!presented) return false;
  return Boolean(
    (cron && presented === cron) ||
      (shared && presented === shared) ||
      (providerSpecific && presented === providerSpecific),
  );
}
