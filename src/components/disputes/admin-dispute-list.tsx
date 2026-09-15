import Link from "next/link";
import {
  markDisputeUnderReview,
  resolveDisputeRefund,
  resolveDisputeRelease,
} from "@/lib/disputes/actions";
import {
  DISPUTE_REASON_LABELS,
  DISPUTE_STATUS_LABELS,
  type DisputeWithRelations,
} from "@/lib/disputes/queries";
import { formatMoney } from "@/lib/money";
import type { DisputeReason, DisputeStatus } from "@/lib/types/database";

async function refundAction(formData: FormData) {
  "use server";
  const id = String(formData.get("dispute_id") ?? "");
  const note = String(formData.get("note") ?? "");
  await resolveDisputeRefund(id, note);
}

async function releaseAction(formData: FormData) {
  "use server";
  const id = String(formData.get("dispute_id") ?? "");
  const note = String(formData.get("note") ?? "");
  await resolveDisputeRelease(id, note);
}

async function reviewAction(formData: FormData) {
  "use server";
  const id = String(formData.get("dispute_id") ?? "");
  await markDisputeUnderReview(id);
}

export function AdminDisputeList({
  disputes,
}: {
  disputes: DisputeWithRelations[];
}) {
  if (disputes.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-8 text-center text-sm text-zinc-500">
        No disputes in this filter.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-zinc-200 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      {disputes.map((dispute) => {
        const open =
          dispute.status === "open" || dispute.status === "under_review";
        return (
          <li key={dispute.id} className="space-y-3 px-4 py-4 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="font-medium text-zinc-950">
                  {DISPUTE_REASON_LABELS[dispute.reason as DisputeReason] ??
                    dispute.reason}
                </p>
                <p className="text-zinc-600">
                  Order{" "}
                  <Link
                    href={`/orders/${dispute.order_id}`}
                    className="font-mono underline underline-offset-2"
                  >
                    {dispute.order_id.slice(0, 8)}…
                  </Link>
                  {dispute.order
                    ? ` · ${formatMoney(Number(dispute.order.total), dispute.order.currency)} · payout ${dispute.order.payout_status}`
                    : ""}
                </p>
                <p className="text-zinc-500">
                  Buyer:{" "}
                  {dispute.opener?.full_name ||
                    dispute.opener?.email ||
                    dispute.opened_by}
                </p>
                {dispute.description ? (
                  <p className="text-zinc-600">{dispute.description}</p>
                ) : null}
                <p className="text-xs text-zinc-400">
                  Opened {new Date(dispute.created_at).toLocaleString()}
                  {dispute.resolved_at
                    ? ` · Resolved ${new Date(dispute.resolved_at).toLocaleString()}`
                    : ""}
                </p>
                {dispute.resolution_note ? (
                  <p className="text-xs text-zinc-500">
                    Note: {dispute.resolution_note}
                  </p>
                ) : null}
              </div>
              <span className="inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium capitalize text-zinc-700 ring-1 ring-inset ring-zinc-200">
                {DISPUTE_STATUS_LABELS[dispute.status as DisputeStatus] ??
                  dispute.status}
              </span>
            </div>

            {open ? (
              <div className="grid gap-3 sm:grid-cols-3">
                {dispute.status === "open" ? (
                  <form action={reviewAction}>
                    <input type="hidden" name="dispute_id" value={dispute.id} />
                    <button
                      type="submit"
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50"
                    >
                      Mark under review
                    </button>
                  </form>
                ) : (
                  <div />
                )}
                <form action={refundAction} className="space-y-2">
                  <input type="hidden" name="dispute_id" value={dispute.id} />
                  <input
                    name="note"
                    placeholder="Refund note (optional)"
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                  <button
                    type="submit"
                    className="w-full rounded-lg bg-rose-700 px-3 py-2 text-sm font-medium text-white hover:bg-rose-600"
                  >
                    Refund buyer
                  </button>
                </form>
                <form action={releaseAction} className="space-y-2">
                  <input type="hidden" name="dispute_id" value={dispute.id} />
                  <input
                    name="note"
                    placeholder="Release note (optional)"
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                  <button
                    type="submit"
                    className="w-full rounded-lg bg-zinc-950 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800"
                  >
                    Release to seller
                  </button>
                </form>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
