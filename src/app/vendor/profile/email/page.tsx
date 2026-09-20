import Link from "next/link";
import { redirect } from "next/navigation";
import { VendorProfileFieldForm } from "@/components/vendors/vendor-profile-field-form";
import { canAccessVendor, getSessionProfile } from "@/lib/auth/session";
import { getVendorForOwner } from "@/lib/vendors/queries";

export const dynamic = "force-dynamic";

export default async function VendorProfileEmailPage() {
  const session = await getSessionProfile();
  if (!session) redirect("/login?next=/vendor/profile/email");
  if (!canAccessVendor(session.role)) redirect("/");

  const vendor = await getVendorForOwner(session.userId);
  if (!vendor) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Email</h1>
        <p className="text-zinc-600">Apply as a vendor first.</p>
        <Link href="/vendor/apply" className="font-medium underline">
          Apply as a vendor
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Profile & settings
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Email</h1>
        <p className="max-w-xl text-sm text-zinc-600">
          Contact email used for store operations and buyer support.
        </p>
      </div>
      <VendorProfileFieldForm vendor={vendor} field="email" />
    </div>
  );
}
