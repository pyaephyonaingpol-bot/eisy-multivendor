import { RegisterForm } from "@/components/auth/register-form";

export const dynamic = "force-dynamic";

export default function RegisterPage() {
  return (
    <section className="mx-auto max-w-sm space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Create account</h1>
        <p className="text-sm text-zinc-600">
          Registers with Supabase Auth and creates a matching profile. Admin
          role cannot be chosen here — promote admins in the database.
        </p>
      </div>
      <RegisterForm />
    </section>
  );
}
