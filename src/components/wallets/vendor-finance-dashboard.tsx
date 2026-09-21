"use client";

import Link from "next/link";
import { useState } from "react";
import {
  UsdtDepositForm,
  WalletWithdrawForm,
} from "@/components/wallets/wallet-forms";
import { formatMoney } from "@/lib/money";
import type { VendorFinanceSnapshot } from "@/lib/wallets/vendor-finance";

type WalletTab = "custom" | "dropship" | "withdrawals" | "deposits";

const TABS: { id: WalletTab; label: string; short: string }[] = [
  { id: "custom", label: "Independent Vendor", short: "Custom" },
  { id: "dropship", label: "CJ Dropshipping", short: "CJ" },
  { id: "withdrawals", label: "Withdrawals", short: "Withdraw" },
  { id: "deposits", label: "Deposits", short: "Deposit" },
];

function statusClass(status: string) {
  switch (status) {
    case "completed":
    case "paid":
      return "bg-emerald-50 text-emerald-800 ring-emerald-200";
    case "rejected":
    case "cancelled":
    case "failed":
      return "bg-red-50 text-red-800 ring-red-200";
    case "waived":
      return "bg-zinc-100 text-zinc-700 ring-zinc-200";
    default:
      return "bg-amber-50 text-amber-900 ring-amber-200";
  }
}

function formatTxType(txType: string) {
  switch (txType) {
    case "inventory_fee":
      return "CJ subscription fee";
    case "platform_commission":
      return "Platform commission";
    case "sale_credit":
      return "Sale credit";
    case "escrow_hold":
      return "Escrow hold";
    case "escrow_release":
      return "Escrow release";
    case "escrow_refund":
      return "Escrow refund";
    case "withdrawal":
      return "Withdrawal";
    case "deposit":
      return "Deposit";
    default:
      return txType.replaceAll("_", " ");
  }
}

function formatMonth(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-zinc-200 bg-white px-3 py-3 sm:px-4">
      <p className="truncate text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p className="mt-1 truncate text-base font-semibold text-zinc-950 sm:text-lg">
        {value}
      </p>
      {hint ? (
        <p className="mt-0.5 truncate text-xs text-zinc-500">{hint}</p>
      ) : null}
    </div>
  );
}

function DetailCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-3 sm:px-4">
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-zinc-950">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}

function TxList({
  rows,
  empty,
}: {
  rows: VendorFinanceSnapshot["transactions"];
  empty: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-6 text-center text-sm text-zinc-500">
        {empty}
      </p>
    );
  }

  return (
    <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white">
      {rows.map((tx) => (
        <li
          key={tx.id}
          className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 text-sm sm:px-4"
        >
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium text-zinc-950">
                {formatTxType(tx.tx_type)}
              </p>
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${statusClass(tx.status)}`}
              >
                {tx.status}
              </span>
            </div>
            <p className="truncate text-xs text-zinc-500">
              {tx.destination ||
                (tx.reference ? `Ref: ${tx.reference}` : tx.note || "—")}
            </p>
          </div>
          <p className="shrink-0 font-medium text-zinc-950">
            {formatMoney(tx.amount, tx.currency)}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function VendorFinanceDashboard({
  snapshot,
  kycApproved,
}: {
  snapshot: VendorFinanceSnapshot;
  kycApproved: boolean;
}) {
  const [tab, setTab] = useState<WalletTab>("custom");
  const usdt = snapshot.wallets.find((wallet) => wallet.currency === "USDT");
  const mmk = snapshot.wallets.find((wallet) => wallet.currency === "MMK");
  const commissionPct = Math.round(snapshot.commission_rate * 1000) / 10;
  const depositTxs = snapshot.transactions.filter(
    (tx) => tx.tx_type === "deposit",
  );

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Wallet
        </p>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-950 sm:text-2xl">
          Wallet & earnings
        </h1>
        <p className="max-w-xl text-sm text-zinc-600">
          Compact balances up top. Open a tab for Custom Source, CJ, withdrawals,
          or deposits — details stay hidden until you need them.
        </p>
      </div>

      {/* Compact summary — always visible */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <Stat
          label="Available"
          value={formatMoney(snapshot.available_usdt, "USDT")}
          hint={`MMK ${formatMoney(snapshot.available_mmk, "MMK")}`}
        />
        <Stat
          label="Escrow"
          value={formatMoney(snapshot.escrow_usdt, "USDT")}
          hint="Held until delivered"
        />
        <Stat
          label="Pending"
          value={formatMoney(snapshot.pending_usdt, "USDT")}
          hint="Withdrawals in review"
        />
        <Stat
          label="Net profit"
          value={formatMoney(snapshot.totals.net_profit_usdt, "USDT")}
          hint={`After ${commissionPct}% fee`}
        />
      </div>

      {/* Mobile-friendly tab bar */}
      <div
        className="-mx-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label="Wallet streams"
      >
        <div className="flex min-w-max gap-1.5 rounded-xl border border-zinc-200 bg-zinc-100/90 p-1 sm:min-w-0 sm:flex-wrap">
          {TABS.map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(item.id)}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition sm:flex-1 ${
                  active
                    ? item.id === "dropship"
                      ? "bg-sky-600 text-white shadow-sm"
                      : "bg-zinc-950 text-white shadow-sm"
                    : "text-zinc-600 hover:bg-white hover:text-zinc-950"
                }`}
              >
                <span className="sm:hidden">{item.short}</span>
                <span className="hidden sm:inline">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Only the active tab’s details */}
      <div
        role="tabpanel"
        className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5"
      >
        {tab === "custom" ? (
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-semibold text-zinc-950">
                Independent Vendor · Custom Source
              </h2>
              <p className="mt-1 text-sm text-zinc-600">
                Manual / custom-sourced income only. Universal {commissionPct}%
                platform commission. No CJ subscription fees.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
              <DetailCard
                label="Gross revenue"
                value={formatMoney(snapshot.custom.gross_revenue_usdt, "USDT")}
                hint={`${snapshot.custom.order_count} orders`}
              />
              <DetailCard
                label="Platform fee"
                value={formatMoney(
                  snapshot.custom.platform_commission_usdt,
                  "USDT",
                )}
                hint={`${commissionPct}% of GMV`}
              />
              <DetailCard
                label="Product cost"
                value={formatMoney(snapshot.custom.product_cost_usdt, "USDT")}
                hint="Direct sales"
              />
              <DetailCard
                label="Net profit"
                value={formatMoney(snapshot.custom.net_profit_usdt, "USDT")}
                hint="Gross − fee"
              />
            </div>
          </div>
        ) : null}

        {tab === "dropship" ? (
          <div className="space-y-5">
            <div>
              <h2 className="text-base font-semibold text-sky-950">
                CJ Dropshipping income
              </h2>
              <p className="mt-1 text-sm text-zinc-600">
                CJ orders only — revenue, supplier cost, {commissionPct}%
                commission, and net. Custom-source sales are excluded.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
              <DetailCard
                label="Gross revenue"
                value={formatMoney(
                  snapshot.dropship.gross_revenue_usdt,
                  "USDT",
                )}
                hint={`${snapshot.dropship.order_count} CJ orders`}
              />
              <DetailCard
                label="Product cost"
                value={formatMoney(
                  snapshot.dropship.product_cost_usdt,
                  "USDT",
                )}
                hint="Supplier cost"
              />
              <DetailCard
                label="Platform fee"
                value={formatMoney(
                  snapshot.dropship.platform_commission_usdt,
                  "USDT",
                )}
                hint={`${commissionPct}% of GMV`}
              />
              <DetailCard
                label="Net profit"
                value={formatMoney(snapshot.dropship.net_profit_usdt, "USDT")}
                hint="After cost + fee"
              />
            </div>

            <div className="space-y-3 border-t border-sky-100 pt-4">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-sky-950">
                    Subscription expenses
                  </h3>
                  <p className="text-xs text-zinc-500">
                    Monthly CJ inventory fees only
                  </p>
                </div>
                <Link
                  href="/vendor/fees"
                  className="text-xs font-medium text-sky-900 underline"
                >
                  Manage fees
                </Link>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <DetailCard
                  label="Paid"
                  value={formatMoney(snapshot.subscriptions.paid_usdt, "USDT")}
                />
                <DetailCard
                  label="Pending"
                  value={formatMoney(
                    snapshot.subscriptions.pending_usdt,
                    "USDT",
                  )}
                />
                <DetailCard
                  label="Failed"
                  value={formatMoney(
                    snapshot.subscriptions.failed_usdt,
                    "USDT",
                  )}
                />
              </div>
              {snapshot.subscriptions.invoices.length === 0 ? (
                <p className="text-center text-sm text-zinc-500">
                  No CJ subscription invoices yet.
                </p>
              ) : (
                <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200">
                  {snapshot.subscriptions.invoices.slice(0, 6).map((invoice) => (
                    <li
                      key={invoice.id}
                      className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="font-medium text-zinc-950">
                          {formatMonth(invoice.billing_month)}
                        </span>
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${statusClass(invoice.status)}`}
                        >
                          {invoice.status}
                        </span>
                      </div>
                      <span className="font-medium text-zinc-950">
                        {formatMoney(invoice.amount_usdt, "USDT")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}

        {tab === "withdrawals" ? (
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-semibold text-zinc-950">
                Withdrawals
              </h2>
              <p className="mt-1 text-sm text-zinc-600">
                Request payouts from available balance. Escrow unlocks after
                delivery confirmation.
              </p>
            </div>

            {!kycApproved ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
                Withdrawals locked until KYC is approved.{" "}
                <Link href="/vendor/kyc" className="font-medium underline">
                  Check KYC
                </Link>
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
              <DetailCard
                label="Completed"
                value={formatMoney(
                  snapshot.withdrawals.completed_usdt,
                  "USDT",
                )}
              />
              <DetailCard
                label="Pending"
                value={formatMoney(snapshot.withdrawals.pending_usdt, "USDT")}
              />
              <DetailCard
                label="Rejected"
                value={formatMoney(snapshot.withdrawals.rejected_usdt, "USDT")}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <WalletWithdrawForm
                currency="USDT"
                available={usdt?.available_balance ?? 0}
              />
              <WalletWithdrawForm
                currency="MMK"
                available={mmk?.available_balance ?? 0}
              />
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-zinc-950">
                Withdrawal history
              </h3>
              <TxList
                rows={snapshot.withdrawals.history}
                empty="No withdrawals yet."
              />
            </div>
          </div>
        ) : null}

        {tab === "deposits" ? (
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-semibold text-zinc-950">
                Deposits
              </h2>
              <p className="mt-1 text-sm text-zinc-600">
                Top up USDT for checkout. MMK deposits are not accepted.
              </p>
            </div>
            <UsdtDepositForm />
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-zinc-950">
                Deposit history
              </h3>
              <TxList rows={depositTxs} empty="No deposits yet." />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
