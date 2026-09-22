import Link from "next/link";
import { UpdatePasswordForm } from "@/components/auth/update-password-form";
import { getSessionProfile } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function UpdatePasswordPage() {
  const session = await getSessionProfile();

  if (!session) {
    return (
      <section className="mx-auto max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          Update password
        </h1>
        <p className="text-sm text-zinc-600">
          Open the reset link from your email first, or request a new one from
          the sign-in page.
        </p>
        <p className="text-sm">
          <Link href="/login" className="underline">
            Back to sign in / Forgot password
          </Link>
        </p>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-sm space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Choose a new password
        </h1>
        <p className="text-sm text-zinc-600">
          Signed in as {session.email ?? "your account"}. Set a new password to
          finish the reset.
        </p>
      </div>
      <UpdatePasswordForm />
    </section>
  );
}
