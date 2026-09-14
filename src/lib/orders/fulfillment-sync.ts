import type {
  FulfillmentSyncSource,
  OrderStatus,
} from "@/lib/types/database";

/**
 * Normalize supplier auto-fulfillment payloads (CJ, DSers, POD, etc.)
 * into marketplace order statuses before calling sync_order_fulfillment.
 */
export function mapSupplierFulfillmentStatus(
  raw: string | null | undefined,
): OrderStatus | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");

  const processing = new Set([
    "processing",
    "in_production",
    "confirmed",
    "accepted",
    "picking",
    "preparing",
    "awaiting_shipment",
  ]);
  const shipped = new Set([
    "shipped",
    "dispatched",
    "in_transit",
    "out_for_delivery",
    "tracking_added",
  ]);
  const delivered = new Set(["delivered", "completed", "received"]);
  const cancelled = new Set(["cancelled", "canceled", "void"]);
  const refunded = new Set(["refunded", "returned"]);

  if (processing.has(value)) return "processing";
  if (shipped.has(value)) return "shipped";
  if (delivered.has(value)) return "delivered";
  if (cancelled.has(value)) return "cancelled";
  if (refunded.has(value)) return "refunded";
  if (value === "paid" || value === "pending") return value;
  return null;
}

export type SupplierFulfillmentUpdate = {
  orderId: string;
  supplierOrderRef?: string | null;
  supplierStatus?: string | null;
  trackingNumber?: string | null;
  trackingCarrier?: string | null;
  trackingUrl?: string | null;
  source?: Extract<
    FulfillmentSyncSource,
    "supplier_webhook" | "supplier_poll" | "system"
  >;
  payload?: Record<string, unknown>;
  note?: string | null;
};

export function buildSupplierFulfillmentRpcArgs(
  update: SupplierFulfillmentUpdate,
) {
  return {
    p_order_id: update.orderId,
    p_status: mapSupplierFulfillmentStatus(update.supplierStatus),
    p_tracking_number: update.trackingNumber ?? null,
    p_tracking_carrier: update.trackingCarrier ?? null,
    p_tracking_url: update.trackingUrl ?? null,
    p_supplier_order_ref: update.supplierOrderRef ?? null,
    p_source: update.source ?? "supplier_webhook",
    p_payload: {
      supplier_status: update.supplierStatus ?? null,
      ...(update.payload ?? {}),
    },
    p_note:
      update.note ??
      (update.supplierStatus
        ? `Supplier status: ${update.supplierStatus}`
        : "Supplier fulfillment sync"),
  };
}
