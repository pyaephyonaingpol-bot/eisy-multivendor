import { redirect } from "next/navigation";
import { formatMoney } from "@/lib/money";
import { getSessionProfile, canAccessAdmin } from "@/lib/auth/session";
import { reviewWalletTransaction } from "@/lib/wallets/actions";
import { listPendingWalletTransactions } from "@/lib/wallets/queries";

export const dynamic = "force-dynamic";

async function approveAction(formData: FormData) {
  "use server";
  const txId = String(formData.get("tx_id") ?? "");
  await reviewWalletTransaction(txId, true);
}

async function rejectAction(formData: FormData) {
  "use server";
  const txId = String(formData.get("tx_id") ?? "");
  await reviewWalletTransaction(txId, false);
}

export default async function AdminWalletsPage() {
  const session = await getSessionProfile();

  if (!session) {
    redirect("/login?next=/admin/wallets");
  }

  if (!canAccessAdmin(session.role)) {
    redirect("/");
  }

  const pending = await listPendingWalletTransactions();

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Wallet reviews</h1>
        <p className="text-zinc-600">
          Approve USDT deposits here. For USDT and MMK withdrawal approvals with
          reviewer notes and audit history, use{" "}
          <a href="/admin/withdrawals" className="underline">
            Withdrawals
          </a>
          . MMK deposits remain blocked at the database layer.
        </p>
      </div>

      {pending.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-10 text-center text-sm text-zinc-500">
          No pending wallet transactions.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white">
          {pending.map((tx) => (
            <li
              key={tx.id}
              className="flex flex-wrap items-start justify-between gap-4 px-4 py-4"
            >
              <div className="min-w-0 space-y-1 text-sm">
                <p className="font-medium capitalize text-zinc-950">
                  {tx.tx_type} · {tx.currency}
                </p>
                <p className="text-zinc-950">{formatMoney(tx.amount, tx.currency)}</p>
                <p className="text-zinc-500">
                  {tx.destination
                    ? tx.destination
                    : tx.reference
                      ? `Ref: ${tx.reference}`
                      : "No destination/reference"}
                </p>
                <p className="text-xs text-zinc-400">User {tx.user_id}</p>
              </div>
              <div className="flex gap-2">
                <form action={approveAction}>
                  <input type="hidden" name="tx_id" value={tx.id} />
                  <button
                    type="submit"
                    className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
                  >
                    Approve
                  </button>
                </form>
                <form action={rejectAction}>
                  <input type="hidden" name="tx_id" value={tx.id} />
                  <button
                    type="submit"
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                  >
                    Reject
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
