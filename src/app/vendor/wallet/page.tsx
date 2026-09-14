import { redirect } from "next/navigation";
import { WalletDashboard } from "@/components/wallets/wallet-dashboard";
import { getSessionProfile, canAccessVendor } from "@/lib/auth/session";
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

  const [wallets, transactions] = await Promise.all([
    listWalletsForUser(session.userId),
    listWalletTransactionsForUser(session.userId),
  ]);

  return (
    <WalletDashboard
      wallets={wallets}
      transactions={transactions}
      title="Vendor wallet"
      subtitle="Product sales settle in USDT. Withdraw USDT on-chain, or withdraw earnings in MMK if you prefer local currency. MMK deposits are disabled."
    />
  );
}
