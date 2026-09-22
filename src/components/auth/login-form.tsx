"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  login,
  requestPasswordReset,
  type AuthActionState,
} from "@/lib/auth/actions";

const initialState: AuthActionState = null;

type LoginFormProps = {
  nextPath?: string;
};

export function LoginForm({ nextPath = "/" }: LoginFormProps) {
  const [state, formAction, pending] = useActionState(login, initialState);
  const [resetState, resetAction, resetPending] = useActionState(
    requestPasswordReset,
    initialState,
  );
  const [email, setEmail] = useState("");

  return (
    <div className="space-y-3">
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="next" value={nextPath} />
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950"
        />
        <input
          type="password"
          name="password"
          required
          autoComplete="current-password"
          placeholder="Password"
          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950"
        />
        {state?.error ? (
          <p className="text-sm text-red-600" role="alert">
            {state.error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending || resetPending}
          className="w-full rounded-lg bg-zinc-950 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Signing in…" : "Continue"}
        </button>
      </form>

      <form action={resetAction} className="space-y-2">
        <input type="hidden" name="email" value={email} />
        <button
          type="submit"
          disabled={pending || resetPending || !email.trim()}
          className="w-full text-sm text-zinc-600 underline-offset-2 hover:text-zinc-950 hover:underline disabled:opacity-60"
        >
          {resetPending ? "Sending reset link…" : "Forgot password?"}
        </button>
        {resetState?.error ? (
          <p className="text-sm text-red-600" role="alert">
            {resetState.error}
          </p>
        ) : null}
        {resetState?.success ? (
          <p className="text-sm text-emerald-700" role="status">
            {resetState.success}
          </p>
        ) : null}
      </form>

      <p className="text-sm text-zinc-600">
        No account?{" "}
        <Link href="/register" className="underline">
          Register
        </Link>
      </p>
    </div>
  );
}
