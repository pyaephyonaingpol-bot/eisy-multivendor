import { LoginForm } from "@/components/auth/login-form";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<{ next?: string; error?: string }>;
};

function loginErrorMessage(error: string | undefined) {
  switch (error) {
    case "auth_config":
    case "config":
      return "Authentication is not configured. Add Supabase environment variables in Vercel.";
    case "auth_callback":
    case "auth":
      return "Sign-in link expired or is invalid. Please try again.";
    case undefined:
      return null;
    default:
      return "Authentication failed. Please try signing in again.";
  }
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const nextPath =
    params.next && params.next.startsWith("/") && !params.next.startsWith("//")
      ? params.next
      : "/";
  const error = loginErrorMessage(params.error);

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
      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      <LoginForm nextPath={nextPath} />
    </section>
  );
}
