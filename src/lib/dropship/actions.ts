"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ProductStatus } from "@/lib/types/database";

export type DropshipImportResult = {
  product_id: string;
  source_product_id: string;
  updated: boolean;
  price: number;
  status: ProductStatus;
  slug?: string;
};

export type DropshipImportState = {
  error?: string;
  success?: string;
  result?: DropshipImportResult;
} | null;

function parsePrice(value: unknown): number | null {
  const amount =
    typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  return Math.round(amount * 100) / 100;
}

function parseStatus(value: unknown): ProductStatus {
  return value === "draft" || value === "archived" ? value : "active";
}

export async function importDropshipProduct(
  sourceProductId: string,
  price: number,
  status: ProductStatus = "active",
): Promise<{ data?: DropshipImportResult; error?: string }> {
  const parsedPrice = parsePrice(price);
  if (!sourceProductId || !parsedPrice) {
    return { error: "Provide a source product and a price greater than zero." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Sign in as an approved vendor to import products." };
  }

  const { data, error } = await supabase.rpc("import_dropship_product", {
    p_source_product_id: sourceProductId,
    p_price: parsedPrice,
    p_status: parseStatus(status),
  });

  if (error) {
    return { error: error.message };
  }

  const result = data as DropshipImportResult;

  revalidatePath("/vendor/products");
  revalidatePath("/vendor/import");
  revalidatePath(`/products/${sourceProductId}`);
  if (result?.product_id) {
    revalidatePath(`/products/${result.product_id}`);
    revalidatePath(`/vendor/products/${result.product_id}/edit`);
  }

  return { data: result };
}

export async function importDropshipProductAction(
  _prev: DropshipImportState,
  formData: FormData,
): Promise<DropshipImportState> {
  const sourceProductId = String(formData.get("source_product_id") ?? "").trim();
  const price = parsePrice(formData.get("price"));
  const status = parseStatus(formData.get("status"));

  if (!sourceProductId || price == null) {
    return { error: "Provide a source product and a price greater than zero." };
  }

  const { data, error } = await importDropshipProduct(
    sourceProductId,
    price,
    status,
  );
  if (error || !data) {
    return { error: error ?? "Import failed." };
  }

  return {
    success: data.updated
      ? "Updated your dropship listing price."
      : "Imported to your store. Checkout will route orders to the supplier.",
    result: data,
  };
}
