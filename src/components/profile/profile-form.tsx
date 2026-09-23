"use client";

import { useActionState } from "react";
import { ClientOnly } from "@/components/client-only";
import { FormSkeleton } from "@/components/form-skeleton";
import {
  updateBuyerProfile,
  type ProfileActionState,
} from "@/lib/profiles/actions";
import type { Profile } from "@/lib/types/database";
import { BUYER_COUNTRY_OPTIONS } from "@/lib/sourcing/constants";

const initialState: ProfileActionState = null;

const fieldClassName =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-base text-zinc-950 outline-none transition focus:border-zinc-400";

type ProfileFormProps = {
  profile: Profile;
};

function ProfileFormFields({ profile }: ProfileFormProps) {
  const [state, formAction, pending] = useActionState(
    updateBuyerProfile,
    initialState,
  );

  const email = (profile.email ?? "").trim();
  const fullName = profile.full_name ?? "";
  const phone = profile.phone ?? "";
  const country = profile.preferred_country_code ?? "";

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block space-y-1.5 text-sm sm:col-span-2">
          <span className="font-medium text-zinc-700">Full name</span>
          <input
            name="full_name"
            required
            defaultValue={fullName}
            className={fieldClassName}
            placeholder="Your name"
            autoComplete="name"
          />
        </label>

        <label className="block space-y-1.5 text-sm sm:col-span-2">
          <span className="font-medium text-zinc-700">Email</span>
          <input
            type="email"
            value={email || "—"}
            readOnly
            className={`${fieldClassName} bg-zinc-50 text-zinc-500`}
          />
        </label>

        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-zinc-700">Phone</span>
          <input
            name="phone"
            type="tel"
            defaultValue={phone}
            className={fieldClassName}
            placeholder="+95…"
            autoComplete="tel"
          />
        </label>

        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-zinc-700">Shipping country</span>
          <select
            name="preferred_country_code"
            defaultValue={country}
            className={fieldClassName}
          >
            <option value="">Select a country</option>
            {BUYER_COUNTRY_OPTIONS.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label} ({option.code})
              </option>
            ))}
          </select>
        </label>
      </div>

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
        className="rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}

/**
 * Client-only so browser extensions that mutate inputs cannot wipe SSR HTML
 * via a hydration mismatch (same pattern as vendor/auth forms).
 */
export function ProfileForm({ profile }: ProfileFormProps) {
  return (
    <ClientOnly fallback={<FormSkeleton rows={4} />}>
      <ProfileFormFields key={profile.id} profile={profile} />
    </ClientOnly>
  );
}
