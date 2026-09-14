import { formatMoney, type Wallet, type WalletTransaction } from "@/lib/money";
import { UsdtDepositForm, WalletWithdrawForm } from "@/components/wallets/wallet-forms";

function statusClass(status: string) {
  switch (status) {
    case "completed":
      return "bg-emerald-50 text-emerald-800 ring-emerald-200";
    case "rejected":
    case "cancelled":
      return "bg-red-50 text-red-800 ring-red-200";
    default:
      return "bg-amber-50 text-amber-900 ring-amber-200";
  }
}

function formatTxType(txType: string) {
  switch (txType) {
    case "inventory_fee":
      return "Inventory fee";
    case "platform_commission":
      return "Platform commission";
    case "sale_credit":
      return "Sale credit";
    default:
      return txType.replaceAll("_", " ");
  }
}

export function WalletDashboard({
  wallets,
  transactions,
  title,
  subtitle,
}: {
  wallets: Wallet[];
  transactions: WalletTransaction[];
  title: string;
  subtitle: string;
}) {
  const usdt = wallets.find((wallet) => wallet.currency === "USDT");
  const mmk = wallets.find((wallet) => wallet.currency === "MMK");

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="max-w-2xl text-zinc-600">{subtitle}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            USDT wallet
          </p>
          <p className="mt-2 text-2xl font-semibold text-zinc-950">
            {formatMoney(usdt?.available_balance ?? 0, "USDT")}
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            Pending: {formatMoney(usdt?.pending_balance ?? 0, "USDT")}
          </p>
          <p className="mt-3 text-xs text-zinc-500">
            Deposits and withdrawals supported. Used for marketplace checkout.
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            MMK wallet
          </p>
          <p className="mt-2 text-2xl font-semibold text-zinc-950">
            {formatMoney(mmk?.available_balance ?? 0, "MMK")}
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            Pending: {formatMoney(mmk?.pending_balance ?? 0, "MMK")}
          </p>
          <p className="mt-3 text-xs text-zinc-500">
            Withdraw-only — MMK deposits are not accepted.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <UsdtDepositForm />
        <WalletWithdrawForm
          currency="USDT"
          available={usdt?.available_balance ?? 0}
        />
        <div className="lg:col-span-2">
          <WalletWithdrawForm
            currency="MMK"
            available={mmk?.available_balance ?? 0}
          />
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Recent activity</h2>
        {transactions.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-8 text-center text-sm text-zinc-500">
            No wallet transactions yet.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white">
            {transactions.map((tx) => (
              <li
                key={tx.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium capitalize text-zinc-950">
                      {formatTxType(tx.tx_type)}
                    </p>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statusClass(tx.status)}`}
                    >
                      {tx.status}
                    </span>
                  </div>
                  <p className="text-zinc-500">
                    {tx.destination
                      ? tx.destination
                      : tx.reference
                        ? `Ref: ${tx.reference}`
                        : "—"}
                  </p>
                </div>
                <p className="font-medium text-zinc-950">
                  {formatMoney(tx.amount, tx.currency)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
