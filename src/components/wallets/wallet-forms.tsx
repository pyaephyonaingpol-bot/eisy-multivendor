"use client";

import { useActionState } from "react";
import {
  requestUsdtDeposit,
  requestWalletWithdrawal,
  type WalletActionState,
} from "@/lib/wallets/actions";
import { formatMoney, type WalletCurrency } from "@/lib/money";

const initialState: WalletActionState = null;

const fieldClassName =
  "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-950";

export function UsdtDepositForm() {
  const [state, formAction, pending] = useActionState(requestUsdtDeposit, initialState);

  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4">
      <div>
        <h3 className="text-sm font-semibold text-zinc-950">Deposit USDT</h3>
        <p className="mt-1 text-xs text-zinc-500">
          Top up your USDT wallet for marketplace checkout. Deposits are reviewed before
          credit.
        </p>
      </div>
      <div className="space-y-2">
        <label htmlFor="deposit-amount" className="text-sm font-medium text-zinc-700">
          Amount (USDT)
        </label>
        <input
          id="deposit-amount"
          name="amount"
          type="number"
          min="0.01"
          step="0.01"
          required
          placeholder="100.00"
          className={fieldClassName}
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="deposit-reference" className="text-sm font-medium text-zinc-700">
          Transfer reference
        </label>
        <input
          id="deposit-reference"
          name="reference"
          placeholder="Tx hash or transfer note"
          className={fieldClassName}
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="deposit-note" className="text-sm font-medium text-zinc-700">
          Note
        </label>
        <input
          id="deposit-note"
          name="note"
          placeholder="Optional"
          className={fieldClassName}
        />
      </div>
      {state?.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
      {state?.success ? (
        <p className="text-sm text-emerald-700" role="status">
          {state.success}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-zinc-950 py-2.5 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Submitting…" : "Submit USDT deposit"}
      </button>
    </form>
  );
}

export function WalletWithdrawForm({
  currency,
  available,
}: {
  currency: WalletCurrency;
  available: number;
}) {
  const [state, formAction, pending] = useActionState(
    requestWalletWithdrawal,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4">
      <input type="hidden" name="currency" value={currency} />
      <div>
        <h3 className="text-sm font-semibold text-zinc-950">
          Withdraw {currency}
        </h3>
        <p className="mt-1 text-xs text-zinc-500">
          Available: {formatMoney(available, currency)}.{" "}
          {currency === "MMK"
            ? "MMK is withdraw-only — deposits are not accepted."
            : "USDT withdrawals are paid to your on-chain destination after review."}
        </p>
      </div>
      <div className="space-y-2">
        <label
          htmlFor={`${currency}-withdraw-amount`}
          className="text-sm font-medium text-zinc-700"
        >
          Amount ({currency})
        </label>
        <input
          id={`${currency}-withdraw-amount`}
          name="amount"
          type="number"
          min="0.01"
          step={currency === "MMK" ? "1" : "0.01"}
          required
          className={fieldClassName}
        />
      </div>
      <div className="space-y-2">
        <label
          htmlFor={`${currency}-destination`}
          className="text-sm font-medium text-zinc-700"
        >
          {currency === "MMK" ? "Bank / mobile money details" : "USDT address + network"}
        </label>
        <textarea
          id={`${currency}-destination`}
          name="destination"
          required
          rows={3}
          placeholder={
            currency === "MMK"
              ? "KPay / WavePay / bank name, account name, account number"
              : "TRC20 / ERC20 address and network"
          }
          className={fieldClassName}
        />
      </div>
      <div className="space-y-2">
        <label
          htmlFor={`${currency}-note`}
          className="text-sm font-medium text-zinc-700"
        >
          Note
        </label>
        <input
          id={`${currency}-note`}
          name="note"
          placeholder="Optional"
          className={fieldClassName}
        />
      </div>
      {state?.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
      {state?.success ? (
        <p className="text-sm text-emerald-700" role="status">
          {state.success}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending || available <= 0}
        className="w-full rounded-lg bg-zinc-950 py-2.5 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Submitting…" : `Request ${currency} withdrawal`}
      </button>
    </form>
  );
}
