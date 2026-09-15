"use client";

import { useActionState, useMemo, useState } from "react";
import { ClientOnly } from "@/components/client-only";
import { FormSkeleton } from "@/components/form-skeleton";
import { applyForVendor, type VendorActionState } from "@/lib/vendors/actions";
import { slugifyStoreName } from "@/lib/vendors/slug";

const initialState: VendorActionState = null;

type VendorApplyFormProps = {
  defaultName?: string;
};

function VendorApplyFormFields({ defaultName = "" }: VendorApplyFormProps) {
  const [name, setName] = useState(defaultName);
  const [slugTouched, setSlugTouched] = useState(false);
  const [slug, setSlug] = useState(slugifyStoreName(defaultName));
  const [state, formAction, pending] = useActionState(applyForVendor, initialState);

  const suggestedSlug = useMemo(() => slugifyStoreName(name), [name]);

  return (
    <form action={formAction} className="mx-auto max-w-lg space-y-4">
      <div className="space-y-2">
        <label htmlFor="name" className="text-sm font-medium text-zinc-700">
          Store name
        </label>
        <input
          id="name"
          name="name"
          required
          value={name}
          onChange={(event) => {
            const next = event.target.value;
            setName(next);
            if (!slugTouched) {
              setSlug(slugifyStoreName(next));
            }
          }}
          placeholder="Acme Goods"
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="slug" className="text-sm font-medium text-zinc-700">
          Store URL slug
        </label>
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <span>/store/</span>
          <input
            id="slug"
            name="slug"
            required
            value={slug}
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(event.target.value);
            }}
            placeholder={suggestedSlug || "acme-goods"}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-950"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="description" className="text-sm font-medium text-zinc-700">
          Short description
        </label>
        <textarea
          id="description"
          name="description"
          rows={4}
          placeholder="What do you sell?"
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
        />
      </div>

      {state?.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-zinc-950 py-2.5 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Submitting…" : "Submit application"}
      </button>

      <p className="text-sm text-zinc-500">
        Your store starts as <strong>pending</strong> until an admin approves it.
      </p>
    </form>
  );
}

export function VendorApplyForm(props: VendorApplyFormProps) {
  return (
    <ClientOnly fallback={<FormSkeleton rows={4} />}>
      <VendorApplyFormFields {...props} />
    </ClientOnly>
  );
}
