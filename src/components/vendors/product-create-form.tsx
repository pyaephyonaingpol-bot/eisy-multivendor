"use client";

import { ProductForm } from "@/components/vendors/product-form";
import type { Category, SourcingRegion } from "@/lib/types/database";

type ProductCreateFormProps = {
  categories: Category[];
  sourcingRegions?: SourcingRegion[];
};

export function ProductCreateForm({
  categories,
  sourcingRegions = [],
}: ProductCreateFormProps) {
  return (
    <ProductForm categories={categories} sourcingRegions={sourcingRegions} />
  );
}
