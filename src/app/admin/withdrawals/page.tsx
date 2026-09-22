import { redirect } from "next/navigation";
import { getSessionProfile, canAccessAdmin } from "@/lib/auth/session";
import { formatMoney } from "@/lib/money";
import { reviewWalletTransaction } from "@/lib/wallets/actions";
import {
  listPendingDeposits,
  listPendingWithdrawals,
  listRecentWalletReviews,
  type AdminWalletTransaction,
} from "@/lib/wallets/queries";

export const dynamic = "force-dynamic";

async function approveWithdrawalAction(formData: FormData) {
  "use server";
  const txId = String(formData.get("tx_id") ?? "");
  const note = String(formData.get("note") ?? "");
  await reviewWalletTransaction(txId, true, note);
}

async function rejectWithdrawalAction(formData: FormData) {
  "use server";
  const txId = String(formData.get("tx_id") ?? "");
  const note = String(formData.get("note") ?? "");
  await reviewWalletTransaction(txId, false, note || "Rejected by admin");
}

function destinationHint(tx: AdminWalletTransaction) {
  if (tx.currency === "MMK") {
    return tx.destination ?? "No KPay / bank details provided";
  }
  return tx.destination ?? "No USDT address provided";
}

function ReviewCard({
  tx,
  showActions,
}: {
  tx: AdminWalletTransaction;
  showActions: boolean;
}) {
  return (
    <li className="space-y-3 px-4 py-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="font-medium capitalize text-zinc-950">
            {tx.tx_type} · {tx.currency}
            {tx.currency === "MMK" ? " (KPay / local bank)" : " (on-chain)"}
          </p>
          <p className="text-zinc-950">{formatMoney(tx.amount, tx.currency)}</p>
          <p className="break-all text-zinc-500">{destinationHint(tx)}</p>
          {tx.reference ? (
            <p className="text-zinc-500">Ref: {tx.reference}</p>
          ) : null}
          {tx.note ? <p className="text-zinc-500">Note: {tx.note}</p> : null}
          <p className="text-xs text-zinc-400">
            {tx.user_full_name || tx.user_email || tx.user_id}
            {tx.user_email && tx.user_full_name ? ` · ${tx.user_email}` : ""}
          </p>
          {tx.reviewed_at ? (
            <p className="text-xs text-zinc-400">
              {tx.status} by {tx.reviewer_email ?? tx.reviewed_by} ·{" "}
              {new Date(tx.reviewed_at).toLocaleString()}
            </p>
          ) : (
            <p className="text-xs text-zinc-400">
              Requested {new Date(tx.created_at).toLocaleString()}
            </p>
          )}
        </div>
        <span className="inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium capitalize text-zinc-700 ring-1 ring-inset ring-zinc-200">
          {tx.status}
        </span>
      </div>

      {showActions ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <form action={approveWithdrawalAction} className="space-y-2">
            <input type="hidden" name="tx_id" value={tx.id} />
            <input
              name="note"
              placeholder="Approval note (optional)"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="w-full rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800"
            >
              Approve {tx.currency} withdrawal
            </button>
          </form>
          <form action={rejectWithdrawalAction} className="space-y-2">
            <input type="hidden" name="tx_id" value={tx.id} />
            <input
              name="note"
              placeholder="Rejection reason"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            >
              Reject
            </button>
          </form>
        </div>
      ) : null}
    </li>
  );
}

export default async function AdminWithdrawalsPage() {
  const session = await getSessionProfile();

  if (!session) {
    redirect("/login?next=/admin/withdrawals");
  }

  if (!canAccessAdmin(session.role)) {
    redirect("/unauthorized?from=admin");
  }

  const [withdrawals, deposits, recent] = await Promise.all([
    listPendingWithdrawals(),
    listPendingDeposits(),
    listRecentWalletReviews(20),
  ]);

  const usdtPending = withdrawals.filter((tx) => tx.currency === "USDT");
  const mmkPending = withdrawals.filter((tx) => tx.currency === "MMK");

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Withdrawal approvals
        </h1>
        <p className="max-w-2xl text-zinc-600">
          Review pending USDT withdrawals (on-chain) and MMK withdrawals (KPay /
          local banks). Approvals write{" "}
          <code className="rounded bg-zinc-100 px-1 text-xs">reviewed_by</code>,{" "}
          <code className="rounded bg-zinc-100 px-1 text-xs">reviewed_at</code>,
          and admin notes into <code className="rounded bg-zinc-100 px-1 text-xs">wallet_transactions</code>.
          USDT deposits remain on the Wallets page.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Pending USDT withdrawals
          </p>
          <p className="mt-2 text-2xl font-semibold">{usdtPending.length}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Pending MMK withdrawals
          </p>
          <p className="mt-2 text-2xl font-semibold">{mmkPending.length}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Pending USDT deposits
          </p>
          <p className="mt-2 text-2xl font-semibold">{deposits.length}</p>
          <p className="mt-1 text-xs text-zinc-500">
            Managed under Admin → Wallets
          </p>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          USDT withdrawals
        </h2>
        {usdtPending.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-8 text-center text-sm text-zinc-500">
            No pending USDT withdrawals.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white">
            {usdtPending.map((tx) => (
              <ReviewCard key={tx.id} tx={tx} showActions />
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          MMK withdrawals (KPay / banks)
        </h2>
        {mmkPending.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-8 text-center text-sm text-zinc-500">
            No pending MMK withdrawals.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white">
            {mmkPending.map((tx) => (
              <ReviewCard key={tx.id} tx={tx} showActions />
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Recent review audit trail
        </h2>
        {recent.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-8 text-center text-sm text-zinc-500">
            No reviewed withdrawals or deposits yet.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white">
            {recent.map((tx) => (
              <ReviewCard key={tx.id} tx={tx} showActions={false} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
