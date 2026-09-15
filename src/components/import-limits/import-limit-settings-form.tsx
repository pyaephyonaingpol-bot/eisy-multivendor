"use client";

import { useActionState } from "react";
import {
  updateImportLimitSettingsAction,
  type ImportLimitSettingsState,
} from "@/lib/import-limits/actions";
import type { PlanImportLimit } from "@/lib/import-limits/queries";

const initialState: ImportLimitSettingsState = null;

type Props = {
  defaultMaxImportItems: number;
  minBillableItems: number;
  planLimits: PlanImportLimit[];
};

export function ImportLimitSettingsForm({
  defaultMaxImportItems,
  minBillableItems,
  planLimits,
}: Props) {
  const [state, formAction, pending] = useActionState(
    updateImportLimitSettingsAction,
    initialState,
  );

  const byPlan = Object.fromEntries(
    planLimits.map((row) => [row.plan, row.max_import_items]),
  );

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4"
    >
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">
          Import limits &amp; tiers
        </h2>
        <p className="text-sm text-zinc-600">
          Cap how many CJ/DSers and marketplace dropship products each account
          can keep (active + draft). The minimum active items matches the 1 USDT
          inventory fee floor.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-zinc-700">
          Min active items (fee floor)
          <input
            name="min_billable_items"
            type="number"
            min={1}
            defaultValue={minBillableItems}
            required
            className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2"
          />
        </label>
        <label className="text-sm text-zinc-700">
          System default max imports
          <input
            name="default_max_import_items"
            type="number"
            min={1}
            defaultValue={defaultMaxImportItems}
            required
            className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2"
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(["free", "starter", "pro", "enterprise"] as const).map((plan) => (
          <label key={plan} className="text-sm capitalize text-zinc-700">
            {plan} max
            <input
              name={`plan_${plan}`}
              type="number"
              min={1}
              defaultValue={byPlan[plan] ?? defaultMaxImportItems}
              required
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2"
            />
          </label>
        ))}
      </div>

      {state?.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
      {state?.success ? (
        <p className="text-sm text-emerald-700">{state.success}</p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save import limits"}
      </button>
    </form>
  );
}
