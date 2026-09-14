"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  importDropshipProductAction,
  type DropshipImportState,
} from "@/lib/dropship/actions";
import { MARKETPLACE_CURRENCY } from "@/lib/money";

type ImportToMyStoreFormProps = {
  sourceProductId: string;
  defaultPrice: number;
  suggestedMinPrice?: number | null;
  alreadyImported?: boolean;
  existingProductId?: string | null;
  compact?: boolean;
};

const initialState: DropshipImportState = null;

export function ImportToMyStoreForm({
  sourceProductId,
  defaultPrice,
  suggestedMinPrice,
  alreadyImported = false,
  existingProductId = null,
  compact = false,
}: ImportToMyStoreFormProps) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    importDropshipProductAction,
    initialState,
  );

  useEffect(() => {
    if (state?.result?.product_id) {
      router.refresh();
    }
  }, [state?.result?.product_id, router]);

  return (
    <form
      action={formAction}
      className={
        compact
          ? "space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3"
          : "space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4"
      }
    >
      <input type="hidden" name="source_product_id" value={sourceProductId} />
      <input type="hidden" name="status" value="active" />

      <div className="space-y-1">
        <p className="text-sm font-semibold text-emerald-950">
          {alreadyImported ? "Update your dropship price" : "Import to My Store"}
        </p>
        <p className="text-xs text-emerald-900/80">
          Copy this supplier product into your catalog. Checkout routes fulfillment
          and stock to the original vendor; you keep the margin above their price.
        </p>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="font-medium text-emerald-950">
          Your selling price ({MARKETPLACE_CURRENCY})
        </span>
        <input
          type="number"
          name="price"
          required
          min={0.01}
          step="0.01"
          defaultValue={defaultPrice}
          className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-zinc-950 outline-none focus:border-emerald-500"
        />
      </label>

      {suggestedMinPrice != null ? (
        <p className="text-xs text-emerald-900/70">
          Supplier catalog price: {suggestedMinPrice.toFixed(2)}{" "}
          {MARKETPLACE_CURRENCY}. Set yours at or above to earn margin.
        </p>
      ) : null}

      {state?.error ? (
        <p className="text-sm text-red-700" role="alert">
          {state.error}
        </p>
      ) : null}
      {state?.success ? (
        <p className="text-sm text-emerald-800" role="status">
          {state.success}
          {state.result?.product_id ? (
            <>
              {" "}
              <a
                href={`/vendor/products/${state.result.product_id}/edit`}
                className="font-medium underline"
              >
                Edit listing
              </a>
            </>
          ) : null}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex rounded-lg bg-emerald-800 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {pending
            ? "Saving…"
            : alreadyImported
              ? "Update price"
              : "Import to My Store"}
        </button>
        {existingProductId ? (
          <a
            href={`/vendor/products/${existingProductId}/edit`}
            className="inline-flex rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-50"
          >
            Open listing
          </a>
        ) : null}
      </div>
    </form>
  );
}
