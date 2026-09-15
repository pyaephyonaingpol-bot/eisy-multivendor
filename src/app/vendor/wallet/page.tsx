import Link from "next/link";
import { redirect } from "next/navigation";
import { WalletDashboard } from "@/components/wallets/wallet-dashboard";
import { getSessionProfile, canAccessVendor } from "@/lib/auth/session";
import {
  getVendorForOwner,
  isVendorKycApproved,
} from "@/lib/vendors/queries";
import {
  listWalletTransactionsForUser,
  listWalletsForUser,
} from "@/lib/wallets/queries";

export const dynamic = "force-dynamic";

export default async function VendorWalletPage() {
  const session = await getSessionProfile();

  if (!session) {
    redirect("/login?next=/vendor/wallet");
  }

  if (!canAccessVendor(session.role)) {
    redirect("/vendor/apply");
  }

  const [wallets, transactions, vendor] = await Promise.all([
    listWalletsForUser(session.userId),
    listWalletTransactionsForUser(session.userId),
    getVendorForOwner(session.userId),
  ]);

  const kycApproved = isVendorKycApproved(vendor);

  return (
    <div className="space-y-6">
      {!kycApproved ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Wallet withdrawals stay locked until KYC is approved.{" "}
          <Link href="/vendor/settings" className="font-medium underline">
            Submit or check KYC in Store settings
          </Link>
          {vendor?.kyc_status ? ` (current: ${vendor.kyc_status})` : null}.
        </div>
      ) : null}
      <WalletDashboard
        wallets={wallets}
        transactions={transactions}
        title="Vendor wallet"
        subtitle="Product sales settle in USDT. Withdraw USDT on-chain, or withdraw earnings in MMK if you prefer local currency. MMK deposits are disabled. Sellers must complete KYC before withdrawing."
      />
    </div>
  );
}
