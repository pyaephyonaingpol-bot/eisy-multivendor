import { LoginForm } from "@/components/auth/login-form";

type LoginPageProps = {
  searchParams: Promise<{ next?: string; error?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const nextPath =
    params.next && params.next.startsWith("/") && !params.next.startsWith("//")
      ? params.next
      : "/";

  return (
    <section className="mx-auto max-w-sm space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-sm text-zinc-600">
          Use the email and password for your Supabase Auth account. Your{" "}
          <code className="rounded bg-zinc-100 px-1.5 py-0.5">profiles</code>{" "}
          row is created automatically on signup.
        </p>
      </div>
      {params.error ? (
        <p className="text-sm text-red-600" role="alert">
          Authentication failed. Please try signing in again.
        </p>
      ) : null}
      <LoginForm nextPath={nextPath} />
    </section>
  );
}
