"use client";

import { useActionState, useMemo, useState } from "react";
import { ClientOnly } from "@/components/client-only";
import { FormSkeleton } from "@/components/form-skeleton";
import {
  createCategory,
  deleteCategory,
  updateCategory,
  type CategoryActionState,
} from "@/lib/categories/actions";
import type { Category } from "@/lib/types/database";
import { slugifyStoreName } from "@/lib/vendors/slug";

const initialState: CategoryActionState = null;

const fieldClassName =
  "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-950";

function CreateCategoryFormFields() {
  const [name, setName] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [slug, setSlug] = useState("");
  const [state, formAction, pending] = useActionState(createCategory, initialState);
  const suggestedSlug = useMemo(() => slugifyStoreName(name), [name]);

  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-zinc-950">Add category</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="create-name" className="text-xs font-medium text-zinc-600">
            Name
          </label>
          <input
            id="create-name"
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
            className={fieldClassName}
            placeholder="Electronics"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="create-slug" className="text-xs font-medium text-zinc-600">
            Slug
          </label>
          <input
            id="create-slug"
            name="slug"
            required
            value={slug}
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(event.target.value);
            }}
            placeholder={suggestedSlug || "electronics"}
            className={fieldClassName}
          />
        </div>
      </div>
      <div className="space-y-1">
        <label htmlFor="create-description" className="text-xs font-medium text-zinc-600">
          Description
        </label>
        <textarea
          id="create-description"
          name="description"
          rows={2}
          className={fieldClassName}
          placeholder="Optional short description"
        />
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <label htmlFor="create-sort" className="text-xs font-medium text-zinc-600">
            Sort order
          </label>
          <input
            id="create-sort"
            name="sort_order"
            type="number"
            defaultValue={0}
            className="w-28 rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input type="checkbox" name="is_active" defaultChecked />
          Active
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Saving…" : "Create category"}
        </button>
      </div>
      {state?.error ? (
        <p className="text-sm text-red-600" role="alert">
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

function EditCategoryFormFields({ category }: { category: Category }) {
  const [state, formAction, pending] = useActionState(updateCategory, initialState);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={category.id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-600" htmlFor={`name-${category.id}`}>
            Name
          </label>
          <input
            id={`name-${category.id}`}
            name="name"
            required
            defaultValue={category.name}
            className={fieldClassName}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-600" htmlFor={`slug-${category.id}`}>
            Slug
          </label>
          <input
            id={`slug-${category.id}`}
            name="slug"
            required
            defaultValue={category.slug}
            className={fieldClassName}
          />
        </div>
      </div>
      <div className="space-y-1">
        <label
          className="text-xs font-medium text-zinc-600"
          htmlFor={`description-${category.id}`}
        >
          Description
        </label>
        <textarea
          id={`description-${category.id}`}
          name="description"
          rows={2}
          defaultValue={category.description ?? ""}
          className={fieldClassName}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-600" htmlFor={`sort-${category.id}`}>
            Sort
          </label>
          <input
            id={`sort-${category.id}`}
            name="sort_order"
            type="number"
            defaultValue={category.sort_order}
            className="w-24 rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input type="checkbox" name="is_active" defaultChecked={category.is_active} />
          Active
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="submit"
          formAction={deleteCategory.bind(null, category.id)}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
        >
          Delete
        </button>
      </div>
      {state?.error ? (
        <p className="text-sm text-red-600" role="alert">
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

type AdminCategoryManagerProps = {
  categories: Category[];
};

export function AdminCategoryManager({ categories }: AdminCategoryManagerProps) {
  return (
    <div className="space-y-6">
      <ClientOnly fallback={<FormSkeleton rows={4} />}>
        <CreateCategoryFormFields />
      </ClientOnly>

      {categories.length === 0 ? (
        <p className="text-sm text-zinc-600">No categories yet. Create the first one above.</p>
      ) : (
        <ul className="space-y-4">
          {categories.map((category) => (
            <li key={category.id} className="rounded-xl border border-zinc-200 bg-white p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <p className="font-medium text-zinc-950">{category.name}</p>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                  /{category.slug}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    category.is_active
                      ? "bg-emerald-50 text-emerald-800"
                      : "bg-zinc-100 text-zinc-600"
                  }`}
                >
                  {category.is_active ? "Active" : "Inactive"}
                </span>
              </div>
              <ClientOnly fallback={<FormSkeleton rows={3} />}>
                <EditCategoryFormFields category={category} />
              </ClientOnly>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
