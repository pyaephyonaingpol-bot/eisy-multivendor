"use client";

import { useActionState, useState } from "react";
import { ClientOnly } from "@/components/client-only";
import { FormSkeleton } from "@/components/form-skeleton";
import {
  updateVendorStoreBranding,
  type VendorActionState,
} from "@/lib/vendors/actions";
import { slugifyStoreName } from "@/lib/vendors/slug";
import type { Vendor } from "@/lib/types/database";

const initialState: VendorActionState = null;

type StoreBrandingFormProps = {
  vendor: Vendor;
};

function StoreBrandingFormFields({ vendor }: StoreBrandingFormProps) {
  const [name, setName] = useState(vendor.name);
  const [slug, setSlug] = useState(vendor.slug);
  const [slugTouched, setSlugTouched] = useState(true);
  const [clearLogo, setClearLogo] = useState(false);
  const [state, formAction, pending] = useActionState(
    updateVendorStoreBranding,
    initialState,
  );

  return (
    <form action={formAction} className="max-w-xl space-y-5">
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
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-950"
          />
        </div>
        <p className="text-xs text-zinc-500">
          Public storefront:{" "}
          <span className="font-medium text-zinc-700">/store/{slug || "…"}</span>
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="description" className="text-sm font-medium text-zinc-700">
          Store description
        </label>
        <textarea
          id="description"
          name="description"
          rows={4}
          defaultValue={vendor.description ?? ""}
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          placeholder="Tell buyers what your store specializes in"
        />
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium text-zinc-700">Store logo</p>
        {vendor.logo_url ? (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={vendor.logo_url}
              alt={`${vendor.name} logo`}
              className={`h-14 w-14 rounded-full object-cover ring-1 ring-zinc-200 ${clearLogo ? "opacity-40" : ""}`}
            />
            <label className="flex items-center gap-2 text-sm text-zinc-600">
              <input
                type="checkbox"
                checked={clearLogo}
                onChange={(event) => setClearLogo(event.target.checked)}
              />
              Remove current logo
            </label>
          </div>
        ) : null}
        <input type="hidden" name="clear_logo" value={clearLogo ? "1" : "0"} />
        <input
          type="file"
          name="logo"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-zinc-800"
        />
        <p className="text-xs text-zinc-500">JPEG, PNG, WebP, or GIF · max 2 MB</p>
      </div>

      {state?.error ? (
        <p
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          role="alert"
        >
          {state.error}
        </p>
      ) : null}
      {state?.success ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {state.success}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save store branding"}
      </button>
    </form>
  );
}

export function StoreBrandingForm({ vendor }: StoreBrandingFormProps) {
  return (
    <ClientOnly fallback={<FormSkeleton />}>
      <StoreBrandingFormFields vendor={vendor} />
    </ClientOnly>
  );
}
