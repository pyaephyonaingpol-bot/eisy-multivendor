import { redirect } from "next/navigation";
import { WalletDashboard } from "@/components/wallets/wallet-dashboard";
import { getSessionProfile } from "@/lib/auth/session";
import {
  listWalletTransactionsForUser,
  listWalletsForUser,
} from "@/lib/wallets/queries";

export const dynamic = "force-dynamic";

export default async function AccountWalletPage() {
  const session = await getSessionProfile();

  if (!session) {
    redirect("/login?next=/account/wallet");
  }

  const [wallets, transactions] = await Promise.all([
    listWalletsForUser(session.userId),
    listWalletTransactionsForUser(session.userId),
  ]);

  return (
    <WalletDashboard
      wallets={wallets}
      transactions={transactions}
      title="Your wallet"
      subtitle="Checkout uses USDT. Deposit or withdraw USDT anytime. MMK is available for earnings withdrawals only — MMK deposits are not accepted."
    />
  );
}
