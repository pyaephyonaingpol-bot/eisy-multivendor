import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AccountMenu } from "@/components/layout/account-menu";
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
    <div className="space-y-8">
      <Suspense
        fallback={
          <div className="h-36 animate-pulse rounded-2xl border border-zinc-200 bg-zinc-50" />
        }
      >
        <AccountMenu
          active="wallet"
          className="rounded-2xl border border-zinc-200 bg-zinc-50/60 p-4 sm:p-5"
        />
      </Suspense>
      <WalletDashboard
        wallets={wallets}
        transactions={transactions}
        title="Your wallet"
        subtitle="Checkout uses USDT. Deposit or withdraw USDT anytime. MMK is available for earnings withdrawals only — MMK deposits are not accepted."
      />
    </div>
  );
}
