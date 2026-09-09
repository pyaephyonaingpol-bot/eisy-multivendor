import Link from "next/link";

export default function LoginPage() {
  return (
    <section className="mx-auto max-w-sm space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="text-sm text-zinc-600">
        Auth will use Supabase Auth once keys are set in{" "}
        <code className="rounded bg-zinc-100 px-1.5 py-0.5">.env.local</code>.
      </p>
      <form className="space-y-3">
        <input
          type="email"
          placeholder="Email"
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
        />
        <input
          type="password"
          placeholder="Password"
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
        />
        <button
          type="button"
          className="w-full rounded-lg bg-zinc-950 py-2 text-sm font-medium text-white"
        >
          Continue
        </button>
      </form>
      <p className="text-sm text-zinc-600">
        No account? <Link href="/register" className="underline">Register</Link>
      </p>
    </section>
  );
}
