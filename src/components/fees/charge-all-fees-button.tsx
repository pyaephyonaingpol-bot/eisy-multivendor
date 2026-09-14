"use client";

import { useActionState } from "react";
import {
  chargeAllInventoryFeesAction,
  type ChargeFeeState,
} from "@/lib/fees/actions";

const initial: ChargeFeeState = null;

export function ChargeAllInventoryFeesButton() {
  const [state, action, pending] = useActionState(
    chargeAllInventoryFeesAction,
    initial,
  );

  return (
    <form action={action} className="space-y-2">
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
      >
        {pending ? "Running billing…" : "Charge all dropshippers this month"}
      </button>
      {state?.error ? (
        <p className="text-sm text-red-700">{state.error}</p>
      ) : null}
      {state?.success ? (
        <p className="text-sm text-emerald-700">{state.success}</p>
      ) : null}
    </form>
  );
}
