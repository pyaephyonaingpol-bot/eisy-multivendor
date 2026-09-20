"use client";

import { useActionState } from "react";
import {
  updateBuyerProfile,
  type ProfileActionState,
} from "@/lib/profiles/actions";
import type { Profile } from "@/lib/types/database";
import { BUYER_COUNTRY_OPTIONS } from "@/lib/sourcing/constants";

const initialState: ProfileActionState = null;

type ProfileFormProps = {
  profile: Profile;
};

export function ProfileForm({ profile }: ProfileFormProps) {
  const [state, formAction, pending] = useActionState(
    updateBuyerProfile,
    initialState,
  );

  return (
    <form action={formAction} className="max-w-xl space-y-4">
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium text-zinc-700">Full name</span>
        <input
          name="full_name"
          required
          defaultValue={profile.full_name ?? ""}
          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2"
          placeholder="Your name"
          autoComplete="name"
        />
      </label>

      <label className="block space-y-1.5 text-sm">
        <span className="font-medium text-zinc-700">Email</span>
        <input
          type="email"
          value={profile.email}
          readOnly
          className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-zinc-600"
        />
        <p className="text-xs text-zinc-500">
          Email comes from your sign-in account and cannot be changed here.
        </p>
      </label>

      <label className="block space-y-1.5 text-sm">
        <span className="font-medium text-zinc-700">Phone</span>
        <input
          name="phone"
          type="tel"
          defaultValue={profile.phone ?? ""}
          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2"
          placeholder="+95…"
          autoComplete="tel"
        />
      </label>

      <label className="block space-y-1.5 text-sm">
        <span className="font-medium text-zinc-700">Preferred shipping country</span>
        <select
          name="preferred_country_code"
          defaultValue={profile.preferred_country_code ?? ""}
          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2"
        >
          <option value="">Select a country</option>
          {BUYER_COUNTRY_OPTIONS.map((option) => (
            <option key={option.code} value={option.code}>
              {option.label} ({option.code})
            </option>
          ))}
        </select>
        <p className="text-xs text-zinc-500">
          Used to filter the product catalog for your region.
        </p>
      </label>

      {state?.error ? (
        <p className="text-sm text-rose-700" role="alert">
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
        {pending ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
