import Link from "next/link";
import { redirect } from "next/navigation";
import { VendorKycForm } from "@/components/vendors/vendor-kyc-form";
import { canAccessVendor, getSessionProfile } from "@/lib/auth/session";
import { getVendorForOwner } from "@/lib/vendors/queries";

export const dynamic = "force-dynamic";

export default async function VendorKycPage() {
  const session = await getSessionProfile();
  if (!session) {
    redirect("/login?next=/vendor/kyc");
  }
  if (!canAccessVendor(session.role)) {
    redirect("/");
  }

  const vendor = await getVendorForOwner(session.userId);
  if (!vendor) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          KYC verification
        </h1>
        <p className="text-zinc-600">
          Apply as a vendor first, then submit identity documents and your USDT
          TRC-20 payout address for review.
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
        <h1 className="text-2xl font-semibold tracking-tight">
          KYC verification
        </h1>
        <p className="max-w-2xl text-sm text-zinc-600">
          Upload a passport, national ID, or trade license and confirm your USDT
          TRC-20 payout wallet. Publishing products and withdrawing funds require
          an approved KYC status. Update store and business details on{" "}
          <Link href="/vendor/profile" className="font-medium underline">
            Vendor profile
          </Link>
          .
        </p>
      </div>

      <VendorKycForm vendor={vendor} />
    </div>
  );
}
