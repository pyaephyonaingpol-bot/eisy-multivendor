"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  formatAuthError,
  isLikelyExistingAccount,
  normalizeAuthEmail,
} from "@/lib/auth/errors";
import { lockBodyScroll } from "@/lib/dom/lock-body-scroll";
import { createClient } from "@/lib/supabase/client";
import {
  getSupabaseConfigError,
  getSupabasePublicEnv,
} from "@/lib/supabase/env";

export type AuthModalMode = "signin" | "signup" | "forgot";

type AuthModalProps = {
  open: boolean;
  onClose: () => void;
  /** Initial tab when the modal opens. */
  initialMode?: AuthModalMode;
  /** Safe in-app path to return to after OAuth / password auth. */
  nextPath?: string;
};

function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden="true"
    >
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function safeNextPath(path: string | undefined): string {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return "/";
  return path;
}

/**
 * Reusable authentication modal: Sign In / Sign Up tabs, Google OAuth,
 * and email/password. Closes via ✕ or backdrop click.
 *
 * Uses `@supabase/ssr` browser client (current Supabase Next.js helper;
 * `@supabase/auth-helpers-nextjs` is deprecated).
 */
export function AuthModal({
  open,
  onClose,
  initialMode = "signin",
  nextPath = "/",
}: AuthModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<AuthModalMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [googlePending, setGooglePending] = useState(false);

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setError(null);
      setMessage(null);
    }
  }, [open, initialMode]);

  useEffect(() => {
    if (!open) return;
    const unlock = lockBodyScroll();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    dialogRef.current?.querySelector<HTMLElement>("button, input")?.focus();
    return () => {
      unlock();
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const redirectTo = useCallback(() => {
    const next = safeNextPath(nextPath);
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
  }, [nextPath]);

  const passwordResetRedirectTo = useCallback(() => {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/auth/callback?next=${encodeURIComponent("/update-password")}`;
  }, []);

  const continueWithGoogle = async () => {
    setError(null);
    setMessage(null);
    if (!getSupabasePublicEnv()) {
      setError(getSupabaseConfigError());
      return;
    }
    setGooglePending(true);
    try {
      const supabase = createClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectTo(),
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });
      if (oauthError) {
        setError(oauthError.message);
        setGooglePending(false);
      }
      // On success the browser navigates away to Google.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed.");
      setGooglePending(false);
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (!getSupabasePublicEnv()) {
      setError(getSupabaseConfigError());
      return;
    }
    const normalizedEmail = normalizeAuthEmail(email);

    if (mode === "forgot") {
      if (!normalizedEmail) {
        setError("Email is required.");
        return;
      }
      setPending(true);
      try {
        const supabase = createClient();
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(
          normalizedEmail,
          { redirectTo: passwordResetRedirectTo() },
        );
        if (resetError) {
          setError(formatAuthError(resetError.message));
          return;
        }
        setMessage(
          "If an Auth account exists for that email, a password reset link has been sent. Open the link to choose a new password.",
        );
      } catch (err) {
        setError(
          formatAuthError(
            err instanceof Error ? err.message : "Could not send reset email.",
          ),
        );
      } finally {
        setPending(false);
      }
      return;
    }

    if (!normalizedEmail || !password) {
      setError("Email and password are required.");
      return;
    }
    setPending(true);
    try {
      const supabase = createClient();
      if (mode === "signin") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });
        if (signInError) {
          setError(formatAuthError(signInError.message));
          return;
        }
        try {
          await supabase.rpc("ensure_own_profile");
        } catch {
          // Self-heal may be unavailable until the linkage migration is applied.
        }
        onClose();
        window.location.assign(safeNextPath(nextPath));
        return;
      }

      const { data: signUpData, error: signUpError } =
        await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            data: { full_name: fullName.trim() || undefined },
            emailRedirectTo: redirectTo(),
          },
        });
      if (signUpError) {
        setError(formatAuthError(signUpError.message));
        return;
      }
      if (isLikelyExistingAccount(signUpData.user)) {
        setError(
          "An account with this email already exists. Sign in instead, or reset your password.",
        );
        setMode("signin");
        return;
      }
      if (signUpData.session) {
        try {
          await supabase.rpc("ensure_own_profile");
        } catch {
          // Self-heal may be unavailable until the linkage migration is applied.
        }
        onClose();
        window.location.assign(safeNextPath(nextPath));
        return;
      }
      setMessage(
        "Check your email to confirm your account, or continue if confirmation is disabled.",
      );
    } catch (err) {
      setError(
        formatAuthError(
          err instanceof Error ? err.message : "Authentication failed.",
        ),
      );
    } finally {
      setPending(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] box-border flex w-full max-w-full items-center justify-center bg-black/60 p-4"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Close authentication dialog"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative my-auto z-10 mx-auto flex max-h-[min(90vh,640px)] w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl sm:max-w-md"
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4">
          <div>
            <h2
              id={titleId}
              className="text-lg font-semibold tracking-tight text-zinc-950"
            >
              {mode === "signin"
                ? "Sign in"
                : mode === "signup"
                  ? "Create account"
                  : "Reset password"}
            </h2>
            <p className="mt-0.5 text-sm text-zinc-500">
              {mode === "forgot"
                ? "We will email you a reset link"
                : "Welcome to Eisy Myanmar"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950"
            aria-label="Close"
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5">
          {mode !== "forgot" ? (
            <>
              <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-zinc-100 p-1 text-sm font-medium">
                <button
                  type="button"
                  onClick={() => {
                    setMode("signin");
                    setError(null);
                    setMessage(null);
                  }}
                  className={`rounded-lg px-3 py-2 transition ${
                    mode === "signin"
                      ? "bg-white text-zinc-950 shadow-sm"
                      : "text-zinc-600 hover:text-zinc-950"
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("signup");
                    setError(null);
                    setMessage(null);
                  }}
                  className={`rounded-lg px-3 py-2 transition ${
                    mode === "signup"
                      ? "bg-white text-zinc-950 shadow-sm"
                      : "text-zinc-600 hover:text-zinc-950"
                  }`}
                >
                  Sign Up
                </button>
              </div>

              <button
                type="button"
                onClick={continueWithGoogle}
                disabled={googlePending || pending}
                className="flex w-full items-center justify-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-800 shadow-sm transition hover:bg-zinc-50 disabled:opacity-60"
              >
                <GoogleLogo />
                {googlePending
                  ? "Redirecting to Google…"
                  : "Continue with Google"}
              </button>

              <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wide text-zinc-400">
                <span className="h-px flex-1 bg-zinc-200" />
                or email
                <span className="h-px flex-1 bg-zinc-200" />
              </div>
            </>
          ) : (
            <p className="mb-4 text-sm text-zinc-600">
              Enter your account email. If it exists in Supabase Auth, you will
              receive a link to choose a new password.
            </p>
          )}

          <form onSubmit={onSubmit} className="space-y-3">
            {mode === "signup" ? (
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium text-zinc-700">Full name</span>
                <input
                  type="text"
                  name="full_name"
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-base outline-none ring-zinc-950 focus:ring-2"
                  placeholder="Your name"
                />
              </label>
            ) : null}
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium text-zinc-700">Email</span>
              <input
                type="email"
                name="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-base outline-none ring-zinc-950 focus:ring-2"
                placeholder="you@example.com"
              />
            </label>
            {mode !== "forgot" ? (
              <label className="block space-y-1.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-zinc-700">Password</span>
                  {mode === "signin" ? (
                    <button
                      type="button"
                      onClick={() => {
                        setMode("forgot");
                        setError(null);
                        setMessage(null);
                      }}
                      className="text-xs font-medium text-zinc-600 underline-offset-2 hover:text-zinc-950 hover:underline"
                    >
                      Forgot password?
                    </button>
                  ) : null}
                </div>
                <input
                  type="password"
                  name="password"
                  autoComplete={
                    mode === "signin" ? "current-password" : "new-password"
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-base outline-none ring-zinc-950 focus:ring-2"
                  placeholder="••••••••"
                />
              </label>
            ) : null}

            {error ? (
              <p className="text-sm text-rose-600" role="alert">
                {error}
              </p>
            ) : null}
            {message ? (
              <p className="text-sm text-emerald-700" role="status">
                {message}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={pending || googlePending}
              className="w-full rounded-xl bg-zinc-950 px-4 py-3 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
            >
              {pending
                ? mode === "signin"
                  ? "Signing in…"
                  : mode === "signup"
                    ? "Creating account…"
                    : "Sending reset link…"
                : mode === "signin"
                  ? "Sign in with email"
                  : mode === "signup"
                    ? "Sign up with email"
                    : "Send reset link"}
            </button>
          </form>

          {mode === "forgot" ? (
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setError(null);
                setMessage(null);
              }}
              className="mt-4 w-full text-center text-sm text-zinc-600 underline-offset-2 hover:text-zinc-950 hover:underline"
            >
              Back to sign in
            </button>
          ) : null}

          <p className="mt-4 text-center text-xs text-zinc-500">
            By continuing you agree to Eisy Myanmar&apos;s terms of use.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Controlled trigger helper for headers / CTAs. */
export function AuthModalTrigger({
  children,
  className,
  initialMode = "signin",
  nextPath,
}: {
  children: ReactNode;
  className?: string;
  initialMode?: AuthModalMode;
  nextPath?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => setOpen(true)}
      >
        {children}
      </button>
      <AuthModal
        open={open}
        onClose={() => setOpen(false)}
        initialMode={initialMode}
        nextPath={nextPath}
      />
    </>
  );
}
