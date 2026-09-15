import { revalidatePath } from "next/cache";
import { canAccessAdmin, getSessionProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getVendorForOwner } from "@/lib/vendors/queries";

export type EscrowControllerResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number };

type EscrowLedgerRow = {
  id: string;
  order_id: string;
  beneficiary_user_id: string;
  role: string;
  amount_usdt: number;
  status: string;
  created_at: string;
  released_at: string | null;
};

type OrderEscrowSummary = {
  id: string;
  status: string;
  payment_status: string;
  payout_status: string;
  platform_commission_usdt: number;
  tracking_number: string | null;
  delivered_at: string | null;
  payout_released_at: string | null;
  customer_id: string;
  vendor_id: string | null;
  seller_vendor_id: string | null;
};

async function canViewOrder(
  order: OrderEscrowSummary,
  userId: string,
  isAdmin: boolean,
): Promise<boolean> {
  if (isAdmin) return true;
  if (order.customer_id === userId) return true;

  const vendor = await getVendorForOwner(userId);
  if (!vendor) return false;
  return (
    order.vendor_id === vendor.id || order.seller_vendor_id === vendor.id
  );
}

export async function getEscrowForOrder(
  orderId: string,
): Promise<
  EscrowControllerResult<{
    order: OrderEscrowSummary;
    ledger: EscrowLedgerRow[];
    hold_status: "held" | "released" | "not_applicable" | "mixed";
  }>
> {
  const session = await getSessionProfile();
  if (!session) {
    return { ok: false, error: "Sign in required.", status: 401 };
  }

  if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
    return { ok: false, error: "Invalid order id.", status: 400 };
  }

  const supabase = await createClient();
  const { data: orderRow, error: orderError } = await supabase
    .from("orders")
    .select(
      "id, status, payment_status, payout_status, platform_commission_usdt, tracking_number, delivered_at, payout_released_at, customer_id, vendor_id, seller_vendor_id",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (orderError) {
    return { ok: false, error: orderError.message, status: 400 };
  }
  if (!orderRow) {
    return { ok: false, error: "Order not found.", status: 404 };
  }

  const order = orderRow as OrderEscrowSummary;
  const isAdmin = canAccessAdmin(session.role);
  if (!(await canViewOrder(order, session.userId, isAdmin))) {
    return { ok: false, error: "Forbidden.", status: 403 };
  }

  const { data: ledgerRows, error: ledgerError } = await supabase
    .from("order_escrow_ledger")
    .select(
      "id, order_id, beneficiary_user_id, role, amount_usdt, status, created_at, released_at",
    )
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });

  if (ledgerError) {
    return { ok: false, error: ledgerError.message, status: 400 };
  }

  const ledger = (ledgerRows as EscrowLedgerRow[] | null) ?? [];
  const statuses = new Set(ledger.map((row) => row.status));
  let hold_status: "held" | "released" | "not_applicable" | "mixed" =
    "not_applicable";
  if (ledger.length === 0) {
    hold_status =
      order.payout_status === "held" || order.payout_status === "released"
        ? (order.payout_status as "held" | "released")
        : "not_applicable";
  } else if (statuses.size === 1) {
    hold_status = statuses.has("released") ? "released" : "held";
  } else {
    hold_status = "mixed";
  }

  return {
    ok: true,
    data: { order, ledger, hold_status },
  };
}

/**
 * Buyer confirms delivery → marks order delivered → releases escrowed payouts.
 * (Does not call service-role-only release_order_escrow directly.)
 */
export async function releaseEscrowOnDelivery(
  orderId: string,
): Promise<
  EscrowControllerResult<{
    order_id: string;
    message: string;
  }>
> {
  const session = await getSessionProfile();
  if (!session) {
    return { ok: false, error: "Sign in to confirm delivery.", status: 401 };
  }

  if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
    return { ok: false, error: "Invalid order id.", status: 400 };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_order_delivered_by_buyer", {
    p_order_id: orderId,
  });

  if (error) {
    return { ok: false, error: error.message, status: 400 };
  }

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/vendor/orders");
  revalidatePath("/vendor/wallet");
  revalidatePath("/account/wallet");

  return {
    ok: true,
    data: {
      order_id: orderId,
      message:
        "Delivery confirmed. Seller payouts moved from escrow to available balance.",
    },
  };
}
