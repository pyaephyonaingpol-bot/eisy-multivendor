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
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "Pending",
  paid: "Paid (USDT)",
  failed: "Failed",
  refunded: "Refunded",
};

export function orderStatusLabel(status: OrderStatus) {
  return ORDER_STATUS_LABELS[status] ?? status;
}

export function paymentStatusLabel(status: PaymentStatus) {
  return PAYMENT_STATUS_LABELS[status] ?? status;
}

export function isTerminalOrderStatus(status: OrderStatus) {
  return status === "cancelled" || status === "refunded";
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
