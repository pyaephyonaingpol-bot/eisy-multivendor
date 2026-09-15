"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  setBuyerSourcingPreferenceAction,
  type SourcingPreferenceState,
} from "@/lib/sourcing/actions";
import { BUYER_COUNTRY_OPTIONS } from "@/lib/sourcing/constants";

const initialState: SourcingPreferenceState = null;

type RegionSelectorProps = {
  countryCode: string;
  regionCode: string;
  regionName: string;
};

export function RegionSelector({
  countryCode,
  regionCode,
  regionName,
}: RegionSelectorProps) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    setBuyerSourcingPreferenceAction,
    initialState,
  );

  useEffect(() => {
    if (state?.success) {
      router.refresh();
    }
  }, [state?.success, router]);

  return (
    <form action={formAction} className="flex items-center gap-1.5 text-xs text-zinc-600">
      <label htmlFor="buyer-country" className="sr-only">
        Shipping country
      </label>
      <select
        id="buyer-country"
        name="country_code"
        defaultValue={countryCode}
        disabled={pending}
        onChange={(event) => {
          event.currentTarget.form?.requestSubmit();
        }}
        className="max-w-[6.75rem] rounded-md border border-zinc-200 bg-white px-1.5 py-1 text-[11px] text-zinc-800 sm:max-w-[8.5rem] sm:px-2 sm:text-xs"
        title={`Sourcing region: ${regionName} (${regionCode})`}
      >
        {BUYER_COUNTRY_OPTIONS.map((option) => (
          <option key={option.code} value={option.code}>
            Ship to {option.label}
          </option>
        ))}
      </select>
      {/* Country drives region matching — do not pin a stale region_code. */}
      <span className="hidden text-zinc-400 sm:inline" aria-hidden>
        ·
      </span>
      <span className="hidden max-w-[7rem] truncate text-zinc-500 sm:inline" title={regionName}>
        {regionName}
      </span>
      {state?.error ? (
        <span className="text-red-600" role="alert">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
