import { redirect } from "next/navigation";
import { WalletDashboard } from "@/components/wallets/wallet-dashboard";
import { getSessionProfile } from "@/lib/auth/session";
import {
  listWalletTransactionsForUser,
  listWalletsForUser,
} from "@/lib/wallets/queries";

export const dynamic = "force-dynamic";

/** Buyer wallet — balances and activity only. */
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
    <div className="mx-auto max-w-3xl py-2">
      <WalletDashboard
        wallets={wallets}
        transactions={transactions}
        title="Wallet"
        subtitle="USDT deposits and withdrawals. MMK is for earnings withdrawals only."
      />
    </div>
  );
}
