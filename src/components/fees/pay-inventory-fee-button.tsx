"use client";

import { useActionState } from "react";
import {
  chargeVendorInventoryFeeAction,
  type ChargeFeeState,
} from "@/lib/fees/actions";

const initial: ChargeFeeState = null;

export function PayInventoryFeeButton({
  vendorId,
  disabled,
  label = "Pay this month’s fee",
}: {
  vendorId: string;
  disabled?: boolean;
  label?: string;
}) {
  const [state, action, pending] = useActionState(
    chargeVendorInventoryFeeAction,
    initial,
  );

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="vendor_id" value={vendorId} />
      <button
        type="submit"
        disabled={disabled || pending}
        className="rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Charging…" : label}
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
