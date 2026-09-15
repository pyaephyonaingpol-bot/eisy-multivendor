"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { ClientOnly } from "@/components/client-only";
import { FormSkeleton } from "@/components/form-skeleton";
import {
  createProduct,
  updateProduct,
  type ProductActionState,
} from "@/lib/products/actions";
import { MAX_PRODUCT_IMAGES } from "@/lib/products/images";
import { MAX_PRODUCT_SPECIFICATIONS } from "@/lib/products/specifications";
import { MARKETPLACE_CURRENCY } from "@/lib/money";
import type {
  Category,
  Product,
  ProductSpecification,
  ProductType,
  SourcingRegion,
} from "@/lib/types/database";
import { slugifyStoreName } from "@/lib/vendors/slug";
import { BUYER_COUNTRY_OPTIONS } from "@/lib/sourcing/constants";

const initialState: ProductActionState = null;

const fieldClassName =
  "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-950";

type ProductFormProps = {
  categories: Category[];
  product?: Product;
  sourcingRegions?: SourcingRegion[];
};

type PreviewItem = {
  id: string;
  url: string;
  file: File;
};

type SpecRow = ProductSpecification & { id: string };

function createSpecRow(spec?: ProductSpecification): SpecRow {
  return {
    id: crypto.randomUUID(),
    key: spec?.key ?? "",
    value: spec?.value ?? "",
  };
}

function ProductFormFields({
  categories,
  product,
  sourcingRegions = [],
}: ProductFormProps) {
  const isEdit = Boolean(product);
  const serverAction = isEdit ? updateProduct : createProduct;
  const [name, setName] = useState(product?.name ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(product));
  const [slug, setSlug] = useState(product?.slug ?? "");
  const [productType, setProductType] = useState<ProductType>(
    product?.product_type ?? "physical",
  );
  const [existingImages, setExistingImages] = useState<string[]>(
    () => product?.images ?? [],
  );
  const [newPreviews, setNewPreviews] = useState<PreviewItem[]>([]);
  const [specRows, setSpecRows] = useState<SpecRow[]>(() => {
    const existing = product?.specifications ?? [];
    return existing.length > 0
      ? existing.map((spec) => createSpecRow(spec))
      : [createSpecRow()];
  });
  const suggestedSlug = useMemo(() => slugifyStoreName(name), [name]);
  const totalImages = existingImages.length + newPreviews.length;

  const boundAction = async (
    prev: ProductActionState,
    formData: FormData,
  ): Promise<ProductActionState> => {
    formData.delete("images");
    for (const preview of newPreviews) {
      formData.append("images", preview.file);
    }
    return serverAction(prev, formData);
  };

  const [state, formAction, pending] = useActionState(boundAction, initialState);

  useEffect(() => {
    return () => {
      newPreviews.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, [newPreviews]);

  function onFilesSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) {
      return;
    }

    const remaining = MAX_PRODUCT_IMAGES - existingImages.length - newPreviews.length;
    if (remaining <= 0) {
      return;
    }

    const next: PreviewItem[] = Array.from(fileList)
      .slice(0, remaining)
      .map((file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
        url: URL.createObjectURL(file),
        file,
      }));

    setNewPreviews((prev) => [...prev, ...next]);
  }

  function removeNewPreview(id: string) {
    setNewPreviews((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target) {
        URL.revokeObjectURL(target.url);
      }
      return prev.filter((item) => item.id !== id);
    });
  }

  return (
    <form action={formAction} className="mx-auto max-w-lg space-y-4">
      {product ? <input type="hidden" name="product_id" value={product.id} /> : null}

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
          defaultValue={product?.category_id ?? ""}
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
          defaultValue={product?.description ?? ""}
          placeholder={
            productType === "digital"
              ? "What’s included in the download"
              : "Materials, size, and what makes it special"
          }
          className={fieldClassName}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor="images" className="text-sm font-medium text-zinc-700">
            Product images
          </label>
          <span className="text-xs text-zinc-500">
            {totalImages}/{MAX_PRODUCT_IMAGES}
          </span>
        </div>

        {existingImages.length > 0 || newPreviews.length > 0 ? (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {existingImages.map((url) => (
              <li
                key={url}
                className="relative overflow-hidden rounded-lg border border-zinc-200"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="aspect-square w-full object-cover" />
                <input type="hidden" name="existing_image" value={url} />
                <button
                  type="button"
                  onClick={() =>
                    setExistingImages((prev) => prev.filter((item) => item !== url))
                  }
                  className="absolute inset-x-0 bottom-0 bg-black/60 py-1 text-[11px] font-medium text-white"
                >
                  Remove
                </button>
              </li>
            ))}
            {newPreviews.map((preview) => (
              <li
                key={preview.id}
                className="relative overflow-hidden rounded-lg border border-zinc-200"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview.url}
                  alt=""
                  className="aspect-square w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeNewPreview(preview.id)}
                  className="absolute inset-x-0 bottom-0 bg-black/60 py-1 text-[11px] font-medium text-white"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <input
          id="images"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          disabled={totalImages >= MAX_PRODUCT_IMAGES}
          onChange={(event) => {
            onFilesSelected(event.target.files);
            event.target.value = "";
          }}
          className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-zinc-800 hover:file:bg-zinc-200 disabled:opacity-50"
        />
        <p className="text-xs text-zinc-500">
          JPEG, PNG, WebP, or GIF up to 2 MB each. Stored in Supabase Storage and linked on
          the product.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border border-zinc-200 p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-zinc-700">Specifications</p>
            <p className="text-xs text-zinc-500">
              Optional key/value details shown on the product page (color, size, storage…).
            </p>
          </div>
          <span className="text-xs text-zinc-500">
            {specRows.filter((row) => row.key.trim() || row.value.trim()).length}/
            {MAX_PRODUCT_SPECIFICATIONS}
          </span>
        </div>

        <ul className="space-y-2">
          {specRows.map((row, index) => (
            <li key={row.id} className="flex flex-wrap items-center gap-2">
              <input
                name="spec_key"
                value={row.key}
                onChange={(event) => {
                  const next = event.target.value;
                  setSpecRows((prev) =>
                    prev.map((item) =>
                      item.id === row.id ? { ...item, key: next } : item,
                    ),
                  );
                }}
                placeholder={index === 0 ? "Color" : "Name"}
                aria-label={`Specification name ${index + 1}`}
                className={`${fieldClassName} sm:flex-1`}
              />
              <input
                name="spec_value"
                value={row.value}
                onChange={(event) => {
                  const next = event.target.value;
                  setSpecRows((prev) =>
                    prev.map((item) =>
                      item.id === row.id ? { ...item, value: next } : item,
                    ),
                  );
                }}
                placeholder={index === 0 ? "Matte black" : "Value"}
                aria-label={`Specification value ${index + 1}`}
                className={`${fieldClassName} sm:flex-1`}
              />
              <button
                type="button"
                onClick={() =>
                  setSpecRows((prev) => {
                    const next = prev.filter((item) => item.id !== row.id);
                    return next.length > 0 ? next : [createSpecRow()];
                  })
                }
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>

        <button
          type="button"
          disabled={specRows.length >= MAX_PRODUCT_SPECIFICATIONS}
          onClick={() =>
            setSpecRows((prev) =>
              prev.length >= MAX_PRODUCT_SPECIFICATIONS
                ? prev
                : [...prev, createSpecRow()],
            )
          }
          className="rounded-lg border border-dashed border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          Add specification
        </button>
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
            defaultValue={product ? String(product.price) : undefined}
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
            defaultValue={
              product?.compare_at_price != null
                ? String(product.compare_at_price)
                : undefined
            }
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
          <input type="hidden" name="currency" value={MARKETPLACE_CURRENCY} />
          <input
            id="currency"
            value={MARKETPLACE_CURRENCY}
            readOnly
            className={`${fieldClassName} bg-zinc-50 text-zinc-700`}
          />
          <p className="text-xs text-zinc-500">
            All marketplace prices and checkouts settle in {MARKETPLACE_CURRENCY}.
          </p>
        </div>
        <div className="space-y-2">
          <label htmlFor="sku" className="text-sm font-medium text-zinc-700">
            SKU
          </label>
          <input
            id="sku"
            name="sku"
            defaultValue={product?.sku ?? ""}
            placeholder="Optional"
            className={fieldClassName}
          />
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
            defaultValue={String(product?.stock_quantity ?? 0)}
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
              defaultValue={product?.download_url ?? ""}
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
              defaultValue={product?.download_label ?? ""}
              placeholder="product-pack.zip"
              className={fieldClassName}
            />
            <p className="text-xs text-zinc-500">
              Optional name shown to buyers (defaults to the URL filename).
            </p>
          </div>
        </div>
      )}

      <div className="space-y-3 rounded-lg border border-zinc-200 p-4">
        <div>
          <p className="text-sm font-medium text-zinc-700">Shipping regions</p>
          <p className="text-xs text-zinc-500">
            Buyers only see this listing when it can ship to their selected country.
            Leave “ships to” empty to use supplier routes (or ship locally by default).
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="origin_country_code" className="text-sm font-medium text-zinc-700">
              Origin country
            </label>
            <select
              id="origin_country_code"
              name="origin_country_code"
              defaultValue={product?.origin_country_code ?? "MM"}
              className={fieldClassName}
            >
              {BUYER_COUNTRY_OPTIONS.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label} ({option.code})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label htmlFor="origin_region_id" className="text-sm font-medium text-zinc-700">
              Origin region
            </label>
            <select
              id="origin_region_id"
              name="origin_region_id"
              defaultValue={product?.origin_region_id ?? ""}
              className={fieldClassName}
            >
              <option value="">Auto from origin country</option>
              {sourcingRegions.map((region) => (
                <option key={region.id} value={region.id}>
                  {region.name} ({region.code})
                </option>
              ))}
            </select>
          </div>
        </div>
        {sourcingRegions.length > 0 ? (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-zinc-700">
              Ships to regions
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {sourcingRegions.map((region) => {
                const checked =
                  product?.ships_to_region_ids?.includes(region.id) ?? false;
                return (
                  <label
                    key={region.id}
                    className="flex items-center gap-2 text-sm text-zinc-700"
                  >
                    <input
                      type="checkbox"
                      name="ships_to_region_ids"
                      value={region.id}
                      defaultChecked={checked}
                      className="rounded border-zinc-300"
                    />
                    {region.name}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ) : null}
      </div>

      <fieldset className="space-y-2 rounded-lg border border-zinc-200 p-3 text-sm">
        <legend className="px-1 text-zinc-600">Status</legend>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="status"
            value="draft"
            defaultChecked={(product?.status ?? "draft") === "draft"}
          />
          Draft — hidden from the storefront
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="status"
            value="active"
            defaultChecked={product?.status === "active"}
          />
          Active — visible when your store is approved
        </label>
        {isEdit ? (
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="status"
              value="archived"
              defaultChecked={product?.status === "archived"}
            />
            Archived — kept in your catalog but not for sale
          </label>
        ) : null}
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
        {pending ? "Saving…" : isEdit ? "Save changes" : "Add product"}
      </button>
    </form>
  );
}

export function ProductForm(props: ProductFormProps) {
  return (
    <ClientOnly fallback={<FormSkeleton rows={10} />}>
      <ProductFormFields {...props} />
    </ClientOnly>
  );
}
