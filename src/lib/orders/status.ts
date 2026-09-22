import type {
  OrderPayoutStatus,
  OrderStatus,
  PaymentStatus,
} from "@/lib/types/database";

/** Buyer-facing fulfillment milestones (USDT payment is tracked separately). */
export const ORDER_STATUS_STEPS: OrderStatus[] = [
  "pending",
  "paid",
  "processing",
  "shipped",
  "delivered",
];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Pending",
  paid: "Paid",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
  out_of_stock: "Out of stock",
  fulfillment_failed: "Fulfillment failed",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "Pending",
  paid: "Paid (USDT)",
  failed: "Failed",
  refunded: "Refunded",
};

export function orderStatusLabel(
  status: OrderStatus,
  syncError?: string | null,
) {
  if (
    (status === "fulfillment_failed" || status === "out_of_stock") &&
    syncError &&
    (/does not ship|shipping unavailable|no available shipping/i.test(
      syncError,
    ))
  ) {
    return "Shipping Unavailable";
  }
  return ORDER_STATUS_LABELS[status] ?? status;
}

export function paymentStatusLabel(status: PaymentStatus) {
  return PAYMENT_STATUS_LABELS[status] ?? status;
}

export function isTerminalOrderStatus(status: OrderStatus) {
  return status === "cancelled" || status === "refunded";
}

export function isSupplierUnavailableStatus(status: OrderStatus) {
  return status === "out_of_stock" || status === "fulfillment_failed";
}

export function orderStatusStepIndex(status: OrderStatus) {
  if (isTerminalOrderStatus(status)) return -1;
  return ORDER_STATUS_STEPS.indexOf(status);
}

export function orderStatusBadgeClass(status: OrderStatus) {
  switch (status) {
    case "pending":
      return "bg-amber-50 text-amber-900 ring-amber-200";
    case "paid":
    case "processing":
      return "bg-sky-50 text-sky-900 ring-sky-200";
    case "shipped":
      return "bg-indigo-50 text-indigo-900 ring-indigo-200";
    case "delivered":
      return "bg-emerald-50 text-emerald-900 ring-emerald-200";
    case "out_of_stock":
    case "fulfillment_failed":
      return "bg-rose-50 text-rose-900 ring-rose-200";
    case "cancelled":
    case "refunded":
      return "bg-zinc-100 text-zinc-700 ring-zinc-200";
    default:
      return "bg-zinc-100 text-zinc-700 ring-zinc-200";
  }
}

export function paymentStatusBadgeClass(status: PaymentStatus) {
  switch (status) {
    case "paid":
      return "bg-emerald-50 text-emerald-900 ring-emerald-200";
    case "pending":
      return "bg-amber-50 text-amber-900 ring-amber-200";
    case "failed":
      return "bg-rose-50 text-rose-900 ring-rose-200";
    case "refunded":
      return "bg-zinc-100 text-zinc-700 ring-zinc-200";
    default:
      return "bg-zinc-100 text-zinc-700 ring-zinc-200";
  }
}

export const PAYOUT_STATUS_LABELS: Record<OrderPayoutStatus, string> = {
  held: "Held in escrow",
  released: "Released",
  not_applicable: "N/A",
  disputed: "Disputed — paused",
  refunded: "Refunded",
};

export function payoutStatusLabel(status: OrderPayoutStatus) {
  return PAYOUT_STATUS_LABELS[status] ?? status;
}

export function payoutStatusBadgeClass(status: OrderPayoutStatus) {
  switch (status) {
    case "held":
      return "bg-amber-50 text-amber-900 ring-amber-200";
    case "released":
      return "bg-emerald-50 text-emerald-900 ring-emerald-200";
    case "disputed":
      return "bg-rose-50 text-rose-900 ring-rose-200";
    case "refunded":
      return "bg-zinc-100 text-zinc-700 ring-zinc-200";
    default:
      return "bg-zinc-100 text-zinc-700 ring-zinc-200";
  }
}

/**
 * Admin dashboard escrow pipeline labels (composite of payment / payout / fulfillment).
 */
export type AdminEscrowStatus =
  | "pending_payment"
  | "escrow_held"
  | "shipped"
  | "completed"
  | "disputed"
  | "refunded";

export const ADMIN_ESCROW_STATUS_LABELS: Record<AdminEscrowStatus, string> = {
  pending_payment: "Pending payment",
  escrow_held: "Escrow held",
  shipped: "Shipped",
  completed: "Completed",
  disputed: "Disputed",
  refunded: "Refunded",
};

export const ADMIN_ESCROW_STATUSES: AdminEscrowStatus[] = [
  "pending_payment",
  "escrow_held",
  "shipped",
  "completed",
  "disputed",
  "refunded",
];

export function deriveAdminEscrowStatus(order: {
  status: OrderStatus;
  payment_status: PaymentStatus;
  payout_status: OrderPayoutStatus;
}): AdminEscrowStatus {
  if (
    order.payout_status === "refunded" ||
    order.status === "refunded" ||
    order.payment_status === "refunded"
  ) {
    return "refunded";
  }
  if (order.payout_status === "disputed") {
    return "disputed";
  }
  if (
    order.status === "delivered" ||
    order.payout_status === "released"
  ) {
    return "completed";
  }
  if (order.status === "shipped") {
    return "shipped";
  }
  if (
    order.payment_status === "paid" &&
    (order.payout_status === "held" ||
      order.payout_status === "not_applicable")
  ) {
    return "escrow_held";
  }
  return "pending_payment";
}

export function adminEscrowStatusLabel(status: AdminEscrowStatus) {
  return ADMIN_ESCROW_STATUS_LABELS[status] ?? status;
}

export function adminEscrowStatusBadgeClass(status: AdminEscrowStatus) {
  switch (status) {
    case "pending_payment":
      return "bg-amber-50 text-amber-900 ring-amber-200";
    case "escrow_held":
      return "bg-sky-50 text-sky-900 ring-sky-200";
    case "shipped":
      return "bg-indigo-50 text-indigo-900 ring-indigo-200";
    case "completed":
      return "bg-emerald-50 text-emerald-900 ring-emerald-200";
    case "disputed":
      return "bg-rose-50 text-rose-900 ring-rose-200";
    case "refunded":
      return "bg-zinc-100 text-zinc-700 ring-zinc-200";
    default:
      return "bg-zinc-100 text-zinc-700 ring-zinc-200";
  }
}

export function tronscanTxUrl(txHash: string) {
  const hash = txHash.trim();
  if (!hash) return null;
  return `https://tronscan.org/#/transaction/${encodeURIComponent(hash)}`;
}
