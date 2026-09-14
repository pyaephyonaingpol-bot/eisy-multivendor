"use client";

import { useActionState, useMemo, useState } from "react";
import { ClientOnly } from "@/components/client-only";
import { FormSkeleton } from "@/components/form-skeleton";
import { createProduct, type ProductActionState } from "@/lib/products/actions";
import { slugifyStoreName } from "@/lib/vendors/slug";

const initialState: ProductActionState = null;

const fieldClassName =
  "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-950";

function ProductCreateFormFields() {
  const [name, setName] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [slug, setSlug] = useState("");
  const [state, formAction, pending] = useActionState(createProduct, initialState);
  const suggestedSlug = useMemo(() => slugifyStoreName(name), [name]);

  return (
    <form action={formAction} className="mx-auto max-w-lg space-y-4">
      <div className="space-y-2">
        <label htmlFor="name" className="text-sm font-medium text-zinc-700">
          Product name
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
          placeholder="Handmade ceramic mug"
          className={fieldClassName}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="slug" className="text-sm font-medium text-zinc-700">
          Product URL slug
        </label>
        <input
          id="slug"
          name="slug"
          required
          value={slug}
          onChange={(event) => {
            setSlugTouched(true);
            setSlug(event.target.value);
          }}
          placeholder={suggestedSlug || "handmade-ceramic-mug"}
          className={fieldClassName}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="description" className="text-sm font-medium text-zinc-700">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={4}
          placeholder="Materials, size, and what makes it special"
          className={fieldClassName}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="price" className="text-sm font-medium text-zinc-700">
            Price
          </label>
          <input
            id="price"
            name="price"
            type="number"
            required
            min="0"
            step="0.01"
            placeholder="24.00"
            className={fieldClassName}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="compare_at_price" className="text-sm font-medium text-zinc-700">
            Compare-at price
          </label>
          <input
            id="compare_at_price"
            name="compare_at_price"
            type="number"
            min="0"
            step="0.01"
            placeholder="Optional"
            className={fieldClassName}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <label htmlFor="currency" className="text-sm font-medium text-zinc-700">
            Currency
          </label>
          <input
            id="currency"
            name="currency"
            defaultValue="USD"
            maxLength={3}
            className={fieldClassName}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="stock_quantity" className="text-sm font-medium text-zinc-700">
            Stock
          </label>
          <input
            id="stock_quantity"
            name="stock_quantity"
            type="number"
            min="0"
            step="1"
            defaultValue="0"
            className={fieldClassName}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="sku" className="text-sm font-medium text-zinc-700">
            SKU
          </label>
          <input id="sku" name="sku" placeholder="Optional" className={fieldClassName} />
        </div>
      </div>

      <fieldset className="space-y-2 rounded-lg border border-zinc-200 p-3 text-sm">
        <legend className="px-1 text-zinc-600">Status</legend>
        <label className="flex items-center gap-2">
          <input type="radio" name="status" value="draft" defaultChecked />
          Draft — hidden from the storefront
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="status" value="active" />
          Active — visible when your store is approved
        </label>
      </fieldset>

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
        {pending ? "Saving…" : "Add product"}
      </button>
    </form>
  );
}

export function ProductCreateForm() {
  return (
    <ClientOnly fallback={<FormSkeleton rows={6} />}>
      <ProductCreateFormFields />
    </ClientOnly>
  );
}
