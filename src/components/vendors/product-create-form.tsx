"use client";

import { useActionState, useMemo, useState } from "react";
import { ClientOnly } from "@/components/client-only";
import { FormSkeleton } from "@/components/form-skeleton";
import { createProduct, type ProductActionState } from "@/lib/products/actions";
import type { Category, ProductType } from "@/lib/types/database";
import { slugifyStoreName } from "@/lib/vendors/slug";

const initialState: ProductActionState = null;

const fieldClassName =
  "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-950";

type ProductCreateFormProps = {
  categories: Category[];
};

function ProductCreateFormFields({ categories }: ProductCreateFormProps) {
  const [name, setName] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [slug, setSlug] = useState("");
  const [productType, setProductType] = useState<ProductType>("physical");
  const [state, formAction, pending] = useActionState(createProduct, initialState);
  const suggestedSlug = useMemo(() => slugifyStoreName(name), [name]);

  return (
    <form action={formAction} className="mx-auto max-w-lg space-y-4">
      <fieldset className="space-y-2 rounded-lg border border-zinc-200 p-3 text-sm">
        <legend className="px-1 text-zinc-600">Product type</legend>
        <label className="flex items-start gap-2">
          <input
            type="radio"
            name="product_type"
            value="physical"
            checked={productType === "physical"}
            onChange={() => setProductType("physical")}
            className="mt-1"
          />
          <span>
            <span className="font-medium text-zinc-950">Physical good</span>
            <span className="block text-zinc-500">
              Ships to customers — track stock quantity.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input
            type="radio"
            name="product_type"
            value="digital"
            checked={productType === "digital"}
            onChange={() => setProductType("digital")}
            className="mt-1"
          />
          <span>
            <span className="font-medium text-zinc-950">Digital product</span>
            <span className="block text-zinc-500">
              Delivered via download link or hosted file URL.
            </span>
          </span>
        </label>
      </fieldset>

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
          placeholder={
            productType === "digital" ? "UI kit ZIP" : "Handmade ceramic mug"
          }
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
          placeholder={
            suggestedSlug ||
            (productType === "digital" ? "ui-kit-zip" : "handmade-ceramic-mug")
          }
          className={fieldClassName}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="category_id" className="text-sm font-medium text-zinc-700">
          Category
        </label>
        <select
          id="category_id"
          name="category_id"
          required
          defaultValue=""
          className={fieldClassName}
        >
          <option value="" disabled>
            Select a category
          </option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        {categories.length === 0 ? (
          <p className="text-xs text-amber-700">
            No active categories yet. Ask an admin to create categories first.
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <label htmlFor="description" className="text-sm font-medium text-zinc-700">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={4}
          placeholder={
            productType === "digital"
              ? "What’s included in the download"
              : "Materials, size, and what makes it special"
          }
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

      <div className="grid gap-4 sm:grid-cols-2">
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
          <label htmlFor="sku" className="text-sm font-medium text-zinc-700">
            SKU
          </label>
          <input id="sku" name="sku" placeholder="Optional" className={fieldClassName} />
        </div>
      </div>

      {productType === "physical" ? (
        <div className="space-y-2">
          <label htmlFor="stock_quantity" className="text-sm font-medium text-zinc-700">
            Stock quantity
          </label>
          <input
            id="stock_quantity"
            name="stock_quantity"
            type="number"
            min="0"
            step="1"
            defaultValue="0"
            required
            className={fieldClassName}
          />
          <p className="text-xs text-zinc-500">
            Units available to ship. Set to 0 to mark as out of stock.
          </p>
        </div>
      ) : (
        <div className="space-y-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
          <div className="space-y-2">
            <label htmlFor="download_url" className="text-sm font-medium text-zinc-700">
              Download link / file URL
            </label>
            <input
              id="download_url"
              name="download_url"
              type="url"
              required
              placeholder="https://files.example.com/product.zip"
              className={fieldClassName}
            />
            <p className="text-xs text-zinc-500">
              Use a direct HTTPS link to the file (storage bucket, CDN, or hosted download).
            </p>
          </div>
          <div className="space-y-2">
            <label htmlFor="download_label" className="text-sm font-medium text-zinc-700">
              File label
            </label>
            <input
              id="download_label"
              name="download_label"
              placeholder="product-pack.zip"
              className={fieldClassName}
            />
            <p className="text-xs text-zinc-500">
              Optional name shown to buyers (defaults to the URL filename).
            </p>
          </div>
        </div>
      )}

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

export function ProductCreateForm(props: ProductCreateFormProps) {
  return (
    <ClientOnly fallback={<FormSkeleton rows={8} />}>
      <ProductCreateFormFields {...props} />
    </ClientOnly>
  );
}
