"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  deleteProduct,
  type ProductActionState,
} from "@/lib/products/actions";

const initialState: ProductActionState = null;

type DeleteProductButtonProps = {
  productId: string;
  productName: string;
  /** Visible label — "Delete" for manual products, "Remove" for imports. */
  label?: string;
  className?: string;
};

export function DeleteProductButton({
  productId,
  productName,
  label = "Delete",
  className,
}: DeleteProductButtonProps) {
  const [state, action, pending] = useActionState(deleteProduct, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.error) {
      // Surface failure without a page-level banner.
      window.alert(state.error);
    }
  }, [state]);

  return (
    <form
      ref={formRef}
      action={action}
      onSubmit={(event) => {
        const confirmed = window.confirm(
          `Remove “${productName}” from your catalog? This cannot be undone.`,
        );
        if (!confirmed) {
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
