"use client";

import { useActionState, useState } from "react";
import { ClientOnly } from "@/components/client-only";
import { FormSkeleton } from "@/components/form-skeleton";
import {
  submitSourcingRequest,
  type SourcingRequestActionState,
} from "@/lib/sourcing-requests/actions";
import type { SourcingRequest } from "@/lib/types/database";
import { formatDateTime } from "@/lib/datetime";

const initialState: SourcingRequestActionState = null;

const fieldClassName =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-base text-zinc-950";

const statusStyles: Record<SourcingRequest["status"], string> = {
  pending: "bg-amber-50 text-amber-900",
  reviewing: "bg-sky-50 text-sky-900",
  sourced: "bg-emerald-50 text-emerald-900",
  rejected: "bg-rose-50 text-rose-900",
  closed: "bg-zinc-100 text-zinc-700",
};

function SourcingRequestFormFields({
  recent,
}: {
  recent: SourcingRequest[];
}) {
  const [state, formAction, pending] = useActionState(
    submitSourcingRequest,
    initialState,
  );
  const [imageName, setImageName] = useState<string | null>(null);

  return (
    <div className="space-y-8">
      <form
        action={formAction}
        encType="multipart/form-data"
        className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5"
      >
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
            Request a product
          </h2>
          <p className="text-sm text-zinc-600">
            Tell us what you want sourced. We check the CJ Dropshipping catalog
            automatically and our team follows up on anything we cannot match.
          </p>
        </div>

        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-zinc-700">Product name</span>
          <input
            type="text"
            name="product_name"
            required
            minLength={2}
            maxLength={200}
            placeholder="e.g. Wireless earbuds with charging case"
            className={fieldClassName}
          />
        </label>

        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-zinc-700">
            Product link / URL{" "}
            <span className="font-normal text-zinc-400">(optional)</span>
          </span>
          <input
            type="url"
            name="product_url"
            placeholder="https://…"
            className={fieldClassName}
          />
        </label>

        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-zinc-700">
            Reference image{" "}
            <span className="font-normal text-zinc-400">(optional)</span>
          </span>
          <input
            type="file"
            name="image"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              setImageName(file?.name ?? null);
            }}
            className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-zinc-800 hover:file:bg-zinc-200"
          />
          <span className="block text-xs text-zinc-500">
            JPEG, PNG, WebP, or GIF · max 2 MB
            {imageName ? ` · selected: ${imageName}` : ""}
          </span>
        </label>

        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-zinc-700">
            Remark / notes{" "}
            <span className="font-normal text-zinc-400">(optional)</span>
          </span>
          <textarea
            name="notes"
            rows={4}
            maxLength={2000}
            placeholder="Color, size, budget, preferred brand, or other details…"
            className={fieldClassName}
          />
        </label>

        {state?.error ? (
          <p
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
            role="alert"
          >
            {state.error}
          </p>
        ) : null}
        {state?.success ? (
          <p
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
            role="status"
          >
            {state.success}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-zinc-950 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
        >
          {pending ? "Submitting…" : "Submit sourcing request"}
        </button>
      </form>

      {recent.length > 0 ? (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Your recent requests
          </h3>
          <ul className="divide-y divide-zinc-100 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            {recent.map((request) => (
              <li key={request.id} className="flex gap-3 px-4 py-3">
                {request.image_url || request.cj_match_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={request.image_url ?? request.cj_match_image_url ?? ""}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-lg object-cover bg-zinc-100"
                  />
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-[10px] text-zinc-400">
                    No image
                  </div>
                )}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium text-zinc-950">
                      {request.product_name}
                    </p>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${statusStyles[request.status]}`}
                    >
                      {request.status}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500">
                    {formatDateTime(request.created_at)}
                    {request.cj_match_title
                      ? ` · CJ match: ${request.cj_match_title}`
                      : ""}
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
                    <p className="line-clamp-2 text-xs text-zinc-600">
                      {request.notes}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

export function SourcingRequestForm({
  recent = [],
}: {
  recent?: SourcingRequest[];
}) {
  return (
    <ClientOnly fallback={<FormSkeleton rows={5} />}>
      <SourcingRequestFormFields recent={recent} />
    </ClientOnly>
  );
}
