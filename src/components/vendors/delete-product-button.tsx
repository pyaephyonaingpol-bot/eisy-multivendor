"use client";

import { useActionState, useEffect } from "react";
import {
  deleteProduct,
  removeCjImportedProduct,
  type ProductActionState,
} from "@/lib/products/actions";

const initialState: ProductActionState = null;

type DeleteProductButtonProps = {
  productId: string;
  productName: string;
  /** Visible label — "Delete" for manual products, "Remove" for CJ imports. */
  label?: string;
  /** Use the CJ-only remove path (registry cleanup + redirect to imported list). */
  mode?: "product" | "cj_import";
  className?: string;
};

export function DeleteProductButton({
  productId,
  productName,
  label = "Delete",
  mode = "product",
  className,
}: DeleteProductButtonProps) {
  const actionFn = mode === "cj_import" ? removeCjImportedProduct : deleteProduct;
  const [state, action, pending] = useActionState(actionFn, initialState);

  useEffect(() => {
    if (state?.error) {
      window.alert(state.error);
    }
  }, [state]);

  const confirmMessage =
    mode === "cj_import"
      ? `Remove “${productName}” from your CJ imported products? It will no longer appear in your store listing.`
      : `Remove “${productName}” from your catalog? This cannot be undone.`;

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="product_id" value={productId} />
      <button
        type="submit"
        disabled={pending}
        className={
          className ??
          "inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-sm font-medium text-rose-800 hover:bg-rose-50 disabled:opacity-60 sm:min-h-0 sm:w-auto"
        }
      >
        {pending ? "Removing…" : label}
      </button>
    </form>
  );
}
