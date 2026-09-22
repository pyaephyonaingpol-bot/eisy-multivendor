"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ClientOnly } from "@/components/client-only";
import { FormSkeleton } from "@/components/form-skeleton";
import {
  updatePassword,
  type AuthActionState,
} from "@/lib/auth/actions";

const initialState: AuthActionState = null;

const fieldClassName =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950";

function UpdatePasswordFormFields() {
  const [state, formAction, pending] = useActionState(
    updatePassword,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-3">
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium text-zinc-700">New password</span>
        <input
          type="password"
          name="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="At least 8 characters"
          className={fieldClassName}
        />
      </label>
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium text-zinc-700">Confirm password</span>
        <input
          type="password"
          name="confirm_password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="Repeat new password"
          className={fieldClassName}
        />
      </label>

      {state?.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
      {state?.success ? (
        <p className="text-sm text-emerald-700" role="status">
          {state.success}{" "}
          <Link href="/" className="underline">
            Continue shopping
          </Link>
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-zinc-950 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Saving…" : "Update password"}
      </button>
    </form>
  );
}

export function UpdatePasswordForm() {
  return (
    <ClientOnly fallback={<FormSkeleton rows={3} />}>
      <UpdatePasswordFormFields />
    </ClientOnly>
  );
}
