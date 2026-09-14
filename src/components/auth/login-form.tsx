"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ClientOnly } from "@/components/client-only";
import { FormSkeleton } from "@/components/form-skeleton";
import { login, type AuthActionState } from "@/lib/auth/actions";

const initialState: AuthActionState = null;

type LoginFormProps = {
  nextPath?: string;
};

function LoginFormFields({ nextPath = "/" }: LoginFormProps) {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="next" value={nextPath} />
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
        autoComplete="current-password"
        placeholder="Password"
        className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
      />
      {state?.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-zinc-950 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Continue"}
      </button>
      <p className="text-sm text-zinc-600">
        No account?{" "}
        <Link href="/register" className="underline">
          Register
        </Link>
      </p>
    </form>
  );
}

export function LoginForm(props: LoginFormProps) {
  return (
    <ClientOnly fallback={<FormSkeleton rows={2} />}>
      <LoginFormFields {...props} />
    </ClientOnly>
  );
}
