import Link from "next/link";
import { redirect } from "next/navigation";
import { VendorProfileForm } from "@/components/vendors/vendor-profile-form";
import { canAccessVendor, getSessionProfile } from "@/lib/auth/session";
import { getVendorForOwner } from "@/lib/vendors/queries";

export const dynamic = "force-dynamic";

export default async function VendorProfilePage() {
  const session = await getSessionProfile();
  if (!session) {
    redirect("/login?next=/vendor/profile");
  }
  if (!canAccessVendor(session.role)) {
    redirect("/");
  }

  const vendor = await getVendorForOwner(session.userId);
  if (!vendor) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Vendor profile</h1>
        <p className="text-zinc-600">
          Apply as a vendor first, then update store details, contact info,
          business registration, and your USDT payout wallet.
        </p>
        <Link
          href="/vendor/apply"
          className="inline-flex rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Apply as a vendor
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Vendor profile</h1>
        <p className="max-w-2xl text-sm text-zinc-600">
          Keep your store details, contact information, business registration,
          and USDT TRC-20 payout address up to date. Identity documents are
          submitted separately on{" "}
          <Link href="/vendor/kyc" className="font-medium underline">
            KYC verification
          </Link>
          . Branding and shipping regions live under{" "}
          <Link href="/vendor/settings" className="font-medium underline">
            Store settings
          </Link>
          .
        </p>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
        <p>
          Store status: <strong>{vendor.status}</strong>
          {" · "}
          KYC: <strong>{vendor.kyc_status ?? "unsubmitted"}</strong>
          {" · "}
          Public URL:{" "}
          <Link href={`/store/${vendor.slug}`} className="font-medium underline">
            /store/{vendor.slug}
          </Link>
        </p>
      </div>

      <VendorProfileForm vendor={vendor} />
    </div>
  );
}
