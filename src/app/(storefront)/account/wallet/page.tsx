import Link from "next/link";
import { redirect } from "next/navigation";
import { WalletDashboard } from "@/components/wallets/wallet-dashboard";
import { getSessionProfile } from "@/lib/auth/session";
import {
  listWalletTransactionsForUser,
  listWalletsForUser,
} from "@/lib/wallets/queries";

export const dynamic = "force-dynamic";

/**
 * Buyer wallet — balance and transfers only.
 * Portal switching lives in the header Account menu.
 */
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
    <div className="mx-auto max-w-3xl space-y-8 py-2">
      <nav
        aria-label="Account sections"
        className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-zinc-200 pb-3 text-sm"
      >
        <Link
          href="/profile"
          className="text-zinc-500 transition hover:text-zinc-950"
        >
          Profile
        </Link>
        <span className="font-medium text-zinc-950">Wallet</span>
        <Link
          href="/orders"
          className="text-zinc-500 transition hover:text-zinc-950"
        >
          Orders
        </Link>
      </nav>

      <WalletDashboard
        wallets={wallets}
        transactions={transactions}
        title="Wallet"
        subtitle="USDT balance, deposits, and withdrawals. MMK is for earnings withdrawals only — MMK deposits are not accepted."
      />
    </div>
  );
}
