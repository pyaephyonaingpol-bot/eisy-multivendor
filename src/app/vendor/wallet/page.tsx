import Link from "next/link";
import { redirect } from "next/navigation";
import { VendorFinanceDashboard } from "@/components/wallets/vendor-finance-dashboard";
import { getSessionProfile, canAccessVendor } from "@/lib/auth/session";
import {
  getVendorForOwner,
  isVendorKycApproved,
} from "@/lib/vendors/queries";
import { getVendorFinanceSnapshot } from "@/lib/wallets/vendor-finance";

export const dynamic = "force-dynamic";

export default async function VendorWalletPage() {
  const session = await getSessionProfile();

  if (!session) {
    redirect("/login?next=/vendor/wallet");
  }

  if (!canAccessVendor(session.role)) {
    redirect("/vendor/apply");
  }

  const vendor = await getVendorForOwner(session.userId);
  if (!vendor) {
    redirect("/vendor/apply");
  }

  const snapshot = await getVendorFinanceSnapshot(session.userId, vendor.id);
  const kycApproved = isVendorKycApproved(vendor);

  return (
    <div className="space-y-6">
      {!kycApproved ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Wallet withdrawals stay locked until KYC is approved.{" "}
          <Link href="/vendor/kyc" className="font-medium underline">
            Submit or check KYC verification
          </Link>
          {vendor?.kyc_status ? ` (current: ${vendor.kyc_status})` : null}.
        </div>
      ) : null}
      <VendorFinanceDashboard
        snapshot={snapshot}
        kycApproved={kycApproved}
      />
    </div>
  );
}
