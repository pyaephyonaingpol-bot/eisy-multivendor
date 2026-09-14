"use client";

import { ProductForm } from "@/components/vendors/product-form";
import type { Category } from "@/lib/types/database";

type ProductCreateFormProps = {
  categories: Category[];
};

export function ProductCreateForm({ categories }: ProductCreateFormProps) {
  return <ProductForm categories={categories} />;
}
