"use client";

import Link from "next/link";
import { useActionState } from "react";
import { register, type AuthActionState } from "@/lib/auth/actions";

const initialState: AuthActionState = null;

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(register, initialState);

  return (
    <form action={formAction} className="space-y-3">
      <input
        type="text"
        name="full_name"
        required
        autoComplete="name"
        placeholder="Full name"
        className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
      />
      <input
        type="email"
        name="email"
        required
        autoComplete="email"
        placeholder="Email"
        className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
      />
      <input
        type="password"
        name="password"
        required
        minLength={8}
        autoComplete="new-password"
        placeholder="Password (min 8 characters)"
        className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
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
