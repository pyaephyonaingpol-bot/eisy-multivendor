"use server";

import { revalidatePath } from "next/cache";
import { canAccessAdmin, getSessionProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { slugifyStoreName } from "@/lib/vendors/slug";

export type CategoryActionState = {
  error?: string;
  success?: string;
} | null;

async function requireAdmin() {
  const session = await getSessionProfile();
  if (!session || !canAccessAdmin(session.role)) {
    return { error: "Admin access required." } as const;
  }
  return { session } as const;
}

function parseSortOrder(value: FormDataEntryValue | null) {
  if (value == null || String(value).trim() === "") {
    return 0;
  }
  const order = Number.parseInt(String(value).trim(), 10);
  if (!Number.isFinite(order)) {
    return NaN;
  }
  return order;
}

export async function createCategory(
  _prev: CategoryActionState,
  formData: FormData,
): Promise<CategoryActionState> {
  const access = await requireAdmin();
  if ("error" in access) {
    return { error: access.error };
  }

  const name = String(formData.get("name") ?? "").trim();
  const slugInput = String(formData.get("slug") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const sortOrder = parseSortOrder(formData.get("sort_order"));
  const isActive = formData.get("is_active") === "on";
  const slug = slugifyStoreName(slugInput || name);

  if (!name) {
    return { error: "Category name is required." };
  }

  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return { error: "Slug must use lowercase letters, numbers, and hyphens." };
  }

  if (Number.isNaN(sortOrder)) {
    return { error: "Sort order must be a whole number." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("categories").insert({
    name,
    slug,
    description: description || null,
    sort_order: sortOrder,
    is_active: isActive,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "That category slug is already in use." };
    }
    return { error: error.message };
  }

  revalidatePath("/admin/categories");
  revalidatePath("/vendor/products/new");
  return { success: "Category created." };
}

export async function updateCategory(
  _prev: CategoryActionState,
  formData: FormData,
): Promise<CategoryActionState> {
  const access = await requireAdmin();
  if ("error" in access) {
    return { error: access.error };
  }

  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const slugInput = String(formData.get("slug") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const sortOrder = parseSortOrder(formData.get("sort_order"));
  const isActive = formData.get("is_active") === "on";
  const slug = slugifyStoreName(slugInput || name);

  if (!id) {
    return { error: "Missing category id." };
  }

  if (!name) {
    return { error: "Category name is required." };
  }

  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return { error: "Slug must use lowercase letters, numbers, and hyphens." };
  }

  if (Number.isNaN(sortOrder)) {
    return { error: "Sort order must be a whole number." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("categories")
    .update({
      name,
      slug,
      description: description || null,
      sort_order: sortOrder,
      is_active: isActive,
    })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return { error: "That category slug is already in use." };
    }
    return { error: error.message };
  }

  revalidatePath("/admin/categories");
  revalidatePath("/vendor/products/new");
  return { success: "Category updated." };
}

export async function deleteCategory(categoryId: string): Promise<void> {
  const access = await requireAdmin();
  if ("error" in access) {
    throw new Error(access.error);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("categories").delete().eq("id", categoryId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/categories");
  revalidatePath("/vendor/products");
  revalidatePath("/vendor/products/new");
}
