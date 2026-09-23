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

type LoginView = "signin" | "forgot";

export function LoginForm({ nextPath = "/" }: LoginFormProps) {
  const [view, setView] = useState<LoginView>("signin");
  const [email, setEmail] = useState("");
  const [state, formAction, pending] = useActionState(login, initialState);
  const [resetState, resetAction, resetPending] = useActionState(
    requestPasswordReset,
    initialState,
  );

  if (view === "forgot") {
    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-zinc-900">
            Reset your password
          </h2>
          <p className="text-sm text-zinc-600">
            Enter the email for your Auth account. We will send a reset link if
            that account exists.
          </p>
        </div>

        <form action={resetAction} className="space-y-3">
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium text-zinc-700">Email</span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-base text-zinc-950"
            />
          </label>

          {resetState?.error ? (
            <p className="break-words text-sm text-red-600" role="alert">
              {resetState.error}
            </p>
          ) : null}
          {resetState?.success ? (
            <p className="break-words text-sm text-emerald-700" role="status">
              {resetState.success}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={resetPending || !email.trim()}
            className="w-full rounded-lg bg-zinc-950 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {resetPending ? "Sending reset link…" : "Send reset link"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => setView("signin")}
          className="w-full text-sm text-zinc-600 underline-offset-2 hover:text-zinc-950 hover:underline"
        >
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="next" value={nextPath} />
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-zinc-700">Email</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-base text-zinc-950"
          />
        </label>
        <label className="block space-y-1.5 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-zinc-700">Password</span>
            <button
              type="button"
              onClick={() => setView("forgot")}
              className="text-xs font-medium text-zinc-600 underline-offset-2 hover:text-zinc-950 hover:underline"
            >
              Forgot password?
            </button>
          </div>
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            placeholder="••••••••"
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-base text-zinc-950"
          />
        </label>
        {state?.error ? (
          <p className="break-words text-sm text-red-600" role="alert">
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
