"use client";

import { useActionState } from "react";
import {
  updateSourcingRequestStatus,
  type SourcingRequestActionState,
} from "@/lib/sourcing-requests/actions";
import type { SourcingRequest } from "@/lib/types/database";
import { formatDateTime } from "@/lib/datetime";

const initialState: SourcingRequestActionState = null;

const statusStyles: Record<SourcingRequest["status"], string> = {
  pending: "bg-amber-50 text-amber-900 ring-amber-200",
  reviewing: "bg-sky-50 text-sky-900 ring-sky-200",
  sourced: "bg-emerald-50 text-emerald-900 ring-emerald-200",
  rejected: "bg-rose-50 text-rose-900 ring-rose-200",
  closed: "bg-zinc-100 text-zinc-700 ring-zinc-200",
};

function AdminStatusForm({ request }: { request: SourcingRequest }) {
  const [state, formAction, pending] = useActionState(
    updateSourcingRequestStatus,
    initialState,
  );

  return (
    <form action={formAction} className="mt-3 space-y-2 border-t border-zinc-100 pt-3">
      <input type="hidden" name="request_id" value={request.id} />
      <div className="flex flex-wrap gap-2">
        <select
          name="status"
          defaultValue={request.status}
          className="rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
        >
          <option value="pending">pending</option>
          <option value="reviewing">reviewing</option>
          <option value="sourced">sourced</option>
          <option value="rejected">rejected</option>
          <option value="closed">closed</option>
        </select>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-zinc-950 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Saving…" : "Update"}
        </button>
      </div>
      <textarea
        name="admin_notes"
        rows={2}
        defaultValue={request.admin_notes ?? ""}
        placeholder="Admin notes (optional)"
        className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
      />
      {state?.error ? (
        <p className="text-sm text-rose-700" role="alert">
          {state.error}
        </p>
      ) : null}
      {state?.success ? (
        <p className="text-sm text-emerald-700" role="status">
          {state.success}
        </p>
      ) : null}
    </form>
  );
}

export function AdminSourcingRequestList({
  requests,
}: {
  requests: SourcingRequest[];
}) {
  if (requests.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center text-sm text-zinc-600">
        No sourcing requests yet.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {requests.map((request) => (
        <li
          key={request.id}
          className="rounded-xl border border-zinc-200 bg-white p-4"
        >
          <div className="flex gap-3">
            {request.image_url || request.cj_match_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={request.image_url ?? request.cj_match_image_url ?? ""}
                alt=""
                className="h-16 w-16 shrink-0 rounded-lg object-cover bg-zinc-100"
              />
            ) : null}
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-medium text-zinc-950">
                  {request.product_name}
                </h3>
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${statusStyles[request.status]}`}
                >
                  {request.status}
                </span>
              </div>
              <p className="text-xs text-zinc-500">
                {formatDateTime(request.created_at)} · user {request.user_id.slice(0, 8)}…
              </p>
              {request.product_url ? (
                <a
                  href={request.product_url}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate text-xs text-sky-700 underline"
                >
                  {request.product_url}
                </a>
              ) : null}
              {request.notes ? (
                <p className="text-sm text-zinc-700">{request.notes}</p>
              ) : null}
              {request.cj_external_product_id ? (
                <p className="text-xs text-emerald-800">
                  CJ match: {request.cj_match_title ?? request.cj_external_product_id}{" "}
                  <span className="font-mono text-zinc-500">
                    ({request.cj_external_product_id})
                  </span>
                </p>
              ) : (
                <p className="text-xs text-zinc-500">No automatic CJ match</p>
              )}
              <AdminStatusForm request={request} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
