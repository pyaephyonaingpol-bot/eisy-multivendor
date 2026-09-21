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
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Wallet</h1>
        <p className="text-zinc-600">
          Submit a vendor application before you can view wallet earnings.
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

  let snapshot;
  try {
    snapshot = await getVendorFinanceSnapshot(session.userId, vendor.id);
  } catch (error) {
    console.error("vendor wallet finance snapshot:", error);
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Wallet</h1>
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          Wallet data could not be loaded right now. Refresh the page or try
          again shortly.
        </p>
        <Link
          href="/vendor/dashboard"
          className="inline-flex text-sm font-medium underline"
        >
          Back to dashboard
        </Link>
      </div>
    );
  }

  const kycApproved = isVendorKycApproved(vendor);

  return (
    <div className="space-y-6">
      {!kycApproved ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Wallet withdrawals stay locked until KYC is approved.{" "}
          <Link href="/vendor/kyc" className="font-medium underline">
            Submit or check KYC verification
          </Link>
          {vendor.kyc_status ? ` (current: ${vendor.kyc_status})` : null}.
        </div>
      ) : null}
      <VendorFinanceDashboard
        snapshot={snapshot}
        kycApproved={kycApproved}
      />
    </div>
  );
}
