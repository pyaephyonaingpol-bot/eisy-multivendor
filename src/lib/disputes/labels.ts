import type { DisputeReason, DisputeStatus } from "@/lib/types/database";

export const DISPUTE_REASON_LABELS: Record<DisputeReason, string> = {
  not_received: "Item not received",
  damaged: "Damaged goods",
  not_as_described: "Not as described",
  wrong_item: "Wrong item",
  other: "Other",
};

export const DISPUTE_STATUS_LABELS: Record<DisputeStatus, string> = {
  open: "Open",
  under_review: "Under review",
  resolved_refund: "Resolved — refunded buyer",
  resolved_release: "Resolved — released to seller",
  cancelled: "Cancelled",
};
