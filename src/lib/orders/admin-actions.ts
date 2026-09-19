"use server";

import { revalidatePath } from "next/cache";
import { canAccessAdmin, getSessionProfile } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type AdminOrderActionState = {
  error?: string;
  success?: string;
} | null;

async function requireAdminSession() {
  const session = await getSessionProfile();
  if (!session) {
    return { error: "Sign in required." as const, session: null };
  }
  if (!canAccessAdmin(session.role)) {
    return { error: "Admin access required." as const, session: null };
  }
  return { error: null, session };
}

function revalidateAdminOrderPaths(orderId: string) {
  revalidatePath("/admin/orders");
  revalidatePath("/admin/disputes");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/transactions");
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/vendor/orders");
  revalidatePath("/vendor/wallet");
  revalidatePath("/account/wallet");
}

/** Admin marks an order as shipped (optional tracking fields). */
export async function adminMarkOrderShipped(
  _prev: AdminOrderActionState,
  formData: FormData,
): Promise<AdminOrderActionState> {
  const auth = await requireAdminSession();
  if (auth.error || !auth.session) {
    return { error: auth.error ?? "Admin access required." };
  }

  const orderId = String(formData.get("order_id") ?? "").trim();
  const trackingNumber = String(formData.get("tracking_number") ?? "").trim();
  const trackingCarrier = String(formData.get("tracking_carrier") ?? "").trim();
  const trackingUrl = String(formData.get("tracking_url") ?? "").trim();

  if (!orderId) {
    return { error: "Order id is required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("sync_order_fulfillment", {
    p_order_id: orderId,
    p_status: "shipped",
    p_tracking_number: trackingNumber || null,
    p_tracking_carrier: trackingCarrier || null,
    p_tracking_url: trackingUrl || null,
    p_source: "manual",
    p_payload: { updated_via: "admin_orders", actor: auth.session.userId },
    p_note: "Admin marked order as shipped",
  });

  if (error) {
    return { error: error.message };
  }

  revalidateAdminOrderPaths(orderId);
  return { success: "Order marked as shipped." };
}

/**
 * Admin releases escrow: marks delivered (which releases held payouts) or
 * calls release_order_escrow via service role when already delivered.
 */
export async function adminReleaseOrderEscrow(
  _prev: AdminOrderActionState,
  formData: FormData,
): Promise<AdminOrderActionState> {
  const auth = await requireAdminSession();
  if (auth.error || !auth.session) {
    return { error: auth.error ?? "Admin access required." };
  }

  const orderId = String(formData.get("order_id") ?? "").trim();
  if (!orderId) {
    return { error: "Order id is required." };
  }

  const supabase = await createClient();
  const { data: orderRow, error: orderError } = await supabase
    .from("orders")
    .select("id, status, payment_status, payout_status")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError) {
    return { error: orderError.message };
  }
  if (!orderRow) {
    return { error: "Order not found." };
  }

  const order = orderRow as {
    id: string;
    status: string;
    payment_status: string;
    payout_status: string;
  };

  if (order.payout_status === "disputed") {
    return {
      error:
        "Escrow is paused for a dispute. Resolve the dispute first (refund or release to seller).",
    };
  }
  if (order.payout_status === "released") {
    return { success: "Escrow was already released." };
  }
  if (order.payment_status !== "paid") {
    return { error: "Only paid orders can release escrow." };
  }

  if (order.status !== "delivered") {
    const { error } = await supabase.rpc("sync_order_fulfillment", {
      p_order_id: orderId,
      p_status: "delivered",
      p_source: "manual",
      p_payload: {
        updated_via: "admin_orders_release_escrow",
        actor: auth.session.userId,
      },
      p_note: "Admin marked delivered to release escrow",
    });
    if (error) {
      return { error: error.message };
    }
  } else {
    try {
      const admin = createServiceClient();
      const { error } = await admin.rpc("release_order_escrow", {
        p_order_id: orderId,
        p_source: "admin_release",
        p_actor: auth.session.userId,
      });
      if (error) {
        return { error: error.message };
      }
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? error.message
            : "Service role is required to release escrow on delivered orders.",
      };
    }
  }

  revalidateAdminOrderPaths(orderId);
  return { success: "Escrow released to seller available balance." };
}

/** Resolve the first open dispute on an order in favor of the seller (release). */
export async function adminResolveOrderDisputeRelease(
  _prev: AdminOrderActionState,
  formData: FormData,
): Promise<AdminOrderActionState> {
  const auth = await requireAdminSession();
  if (auth.error || !auth.session) {
    return { error: auth.error ?? "Admin access required." };
  }

  const disputeId = String(formData.get("dispute_id") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  if (!disputeId) {
    return { error: "Dispute id is required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_dispute_release_seller", {
    p_dispute_id: disputeId,
    p_note: note || "Resolved from admin orders dashboard",
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/orders");
  revalidatePath("/admin/disputes");
  revalidatePath("/admin/dashboard");
  revalidatePath("/orders");
  revalidatePath("/account/wallet");
  revalidatePath("/vendor/wallet");
  return { success: "Dispute resolved — escrow released to seller." };
}

/** Resolve the first open dispute on an order as a buyer refund. */
export async function adminResolveOrderDisputeRefund(
  _prev: AdminOrderActionState,
  formData: FormData,
): Promise<AdminOrderActionState> {
  const auth = await requireAdminSession();
  if (auth.error || !auth.session) {
    return { error: auth.error ?? "Admin access required." };
  }

  const disputeId = String(formData.get("dispute_id") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  if (!disputeId) {
    return { error: "Dispute id is required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_dispute_refund_buyer", {
    p_dispute_id: disputeId,
    p_note: note || "Refunded from admin orders dashboard",
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/orders");
  revalidatePath("/admin/disputes");
  revalidatePath("/admin/dashboard");
  revalidatePath("/orders");
  revalidatePath("/account/wallet");
  revalidatePath("/vendor/wallet");
  return { success: "Dispute resolved — buyer refunded." };
}
