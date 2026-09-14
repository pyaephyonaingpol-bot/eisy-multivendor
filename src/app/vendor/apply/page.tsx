import Link from "next/link";
import { redirect } from "next/navigation";
import { VendorApplyForm } from "@/components/vendors/vendor-apply-form";
import { getSessionProfile } from "@/lib/auth/session";
import { getVendorForOwner } from "@/lib/vendors/queries";

export const dynamic = "force-dynamic";

export default async function VendorApplyPage() {
  const session = await getSessionProfile();

  if (!session) {
    redirect("/login?next=/vendor/apply");
  }

  const existing = await getVendorForOwner(session.userId);

  if (existing) {
    redirect("/vendor/dashboard");
  }

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Vendor onboarding
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Apply to sell</h1>
        <p className="max-w-xl text-zinc-600">
          Tell us about your store. Applications are created with{" "}
          <code className="rounded bg-zinc-100 px-1.5 py-0.5">pending</code> status
          and go live after an admin approves them.
        </p>
      </div>

      <VendorApplyForm defaultName={session.profile?.full_name ?? ""} />

      <p className="text-sm text-zinc-500">
        Just browsing?{" "}
        <Link href="/" className="underline">
          Back to storefront
        </Link>
      </p>
    </section>
  );
}
