"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ClientOnly } from "@/components/client-only";
import { FormSkeleton } from "@/components/form-skeleton";
import { BuyerCountrySelect } from "@/components/storefront/buyer-country-select";
import { register, type AuthActionState } from "@/lib/auth/actions";

const initialState: AuthActionState = null;

const fieldClassName =
  "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm";

function RegisterFormFields() {
  const [state, formAction, pending] = useActionState(register, initialState);
  const [includeAddress, setIncludeAddress] = useState(false);
  const [country, setCountry] = useState("MM");
  const [setAsDefault, setSetAsDefault] = useState(true);

  return (
    <form action={formAction} className="space-y-3">
      <input
        type="text"
        name="full_name"
        required
        autoComplete="name"
        placeholder="Full name"
        className={fieldClassName}
      />
      <input
        type="email"
        name="email"
        required
        autoComplete="email"
        placeholder="Email"
        className={fieldClassName}
      />
      <input
        type="password"
        name="password"
        required
        minLength={8}
        autoComplete="new-password"
        placeholder="Password (min 8 characters)"
        className={fieldClassName}
      />
      <fieldset className="space-y-2 rounded-lg border border-zinc-200 p-3 text-sm">
        <legend className="px-1 text-zinc-600">Account type</legend>
        <label className="flex items-center gap-2">
          <input type="radio" name="role" value="customer" defaultChecked />
          Customer — shop the marketplace
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="role" value="vendor" />
          Vendor — continue to store application (pending approval)
        </label>
      </fieldset>

      <div className="space-y-2 rounded-lg border border-zinc-200 p-3">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeAddress}
            onChange={(event) => setIncludeAddress(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-zinc-300"
          />
          <span>
            <span className="font-medium text-zinc-900">
              Add a delivery address now
            </span>
            <span className="mt-0.5 block text-xs text-zinc-500">
              Optional. Useful so checkout can pre-fill your default shipping
              details.
            </span>
          </span>
        </label>

        {includeAddress ? (
          <div className="grid gap-2 border-t border-zinc-100 pt-3 sm:grid-cols-2">
            <input type="hidden" name="save_delivery_address" value="1" />
            <input
              name="address_phone"
              type="tel"
              placeholder="Phone"
              className={`${fieldClassName} sm:col-span-2`}
            />
            <div className="sm:col-span-2">
              <BuyerCountrySelect
                name="address_country"
                value={country}
                onChange={setCountry}
                className={fieldClassName}
              />
            </div>
            <input
              name="address_line1"
              required={includeAddress}
              placeholder="Address line 1"
              className={`${fieldClassName} sm:col-span-2`}
            />
            <input
              name="address_line2"
              placeholder="Address line 2"
              className={`${fieldClassName} sm:col-span-2`}
            />
            <input
              name="address_city"
              required={includeAddress}
              placeholder="City"
              className={fieldClassName}
            />
            <input
              name="address_region"
              placeholder="State / region"
              className={fieldClassName}
            />
            <input
              name="address_postal_code"
              placeholder="Postal code"
              className={fieldClassName}
            />
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                name="address_is_default"
                value="1"
                checked={setAsDefault}
                onChange={(event) => setSetAsDefault(event.target.checked)}
                className="h-4 w-4 rounded border-zinc-300"
              />
              <span className="font-medium text-zinc-800">
                Set as default delivery address
              </span>
            </label>
          </div>
        ) : null}
      </div>

      {state?.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
      {state?.success ? (
        <p className="text-sm text-emerald-700" role="status">
          {state.success}{" "}
          <Link href="/login" className="underline">
            Sign in
          </Link>
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-zinc-950 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Creating account…" : "Register"}
      </button>
      <p className="text-sm text-zinc-600">
        Already have an account?{" "}
        <Link href="/login" className="underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}

export function RegisterForm() {
  return (
    <ClientOnly fallback={<FormSkeleton rows={4} />}>
      <RegisterFormFields />
    </ClientOnly>
  );
}
