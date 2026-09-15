"use server";

import { revalidatePath } from "next/cache";
import { getSessionProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { OrderStatus } from "@/lib/types/database";
import { getVendorForOwner } from "@/lib/vendors/queries";

export type FulfillmentActionState = {
  error?: string;
  success?: string;
} | null;

const VENDOR_ALLOWED_STATUSES: OrderStatus[] = [
  "processing",
  "shipped",
  "delivered",
  "cancelled",
];

export async function updateOrderFulfillment(
  _prev: FulfillmentActionState,
  formData: FormData,
): Promise<FulfillmentActionState> {
  const session = await getSessionProfile();
  if (!session) {
    return { error: "Sign in as a vendor to update fulfillment." };
  }

  const vendor = await getVendorForOwner(session.userId);
  if (!vendor) {
    return { error: "Vendor profile required." };
  }

  const orderId = String(formData.get("order_id") ?? "").trim();
  const statusRaw = String(formData.get("status") ?? "").trim() as OrderStatus;
  const trackingNumber = String(formData.get("tracking_number") ?? "").trim();
  const trackingCarrier = String(formData.get("tracking_carrier") ?? "").trim();
  const trackingUrl = String(formData.get("tracking_url") ?? "").trim();
  const supplierOrderRef = String(
    formData.get("supplier_order_ref") ?? "",
  ).trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!orderId) {
    return { error: "Order id is required." };
  }

  if (statusRaw && !VENDOR_ALLOWED_STATUSES.includes(statusRaw)) {
    return { error: "Choose a valid fulfillment status." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("sync_order_fulfillment", {
    p_order_id: orderId,
    p_status: statusRaw || null,
    p_tracking_number: trackingNumber || null,
    p_tracking_carrier: trackingCarrier || null,
    p_tracking_url: trackingUrl || null,
    p_supplier_order_ref: supplierOrderRef || null,
    p_source: "manual",
    p_payload: { updated_via: "vendor_orders" },
    p_note: note || "Vendor fulfillment update",
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/vendor/orders");
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/vendor/wallet");
  revalidatePath("/account/wallet");

  return { success: "Fulfillment details saved." };
}

export type ConfirmDeliveryActionState = {
  error?: string;
  success?: string;
} | null;

/** Buyer confirms receipt → marks delivered → releases escrowed payouts. */
export async function confirmOrderDeliveredByBuyer(
  _prev: ConfirmDeliveryActionState,
  formData: FormData,
): Promise<ConfirmDeliveryActionState> {
  const session = await getSessionProfile();
  if (!session) {
    return { error: "Sign in to confirm delivery." };
  }

  const orderId = String(formData.get("order_id") ?? "").trim();
  if (!orderId) {
    return { error: "Order id is required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_order_delivered_by_buyer", {
    p_order_id: orderId,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/vendor/orders");
  revalidatePath("/vendor/wallet");
  revalidatePath("/account/wallet");

  return {
    success:
      "Delivery confirmed. Seller payouts will move from escrow to available balance.",
  };
}
