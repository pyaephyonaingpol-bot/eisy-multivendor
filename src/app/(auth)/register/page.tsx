import Link from "next/link";

export default function RegisterPage() {
  return (
    <section className="mx-auto max-w-sm space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Create account</h1>
      <form className="space-y-3">
        <input
          type="text"
          placeholder="Full name"
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
        />
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
          Register
        </button>
      </form>
      <p className="text-sm text-zinc-600">
        Already have an account? <Link href="/login" className="underline">Sign in</Link>
      </p>
    </section>
  );
}
