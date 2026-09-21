"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  UsdtDepositForm,
  WalletWithdrawForm,
} from "@/components/wallets/wallet-forms";
import { formatMoney } from "@/lib/money";
import type { VendorFinanceSnapshot } from "@/lib/wallets/vendor-finance";

const SECTIONS = [
  { id: "balances", label: "Balances" },
  { id: "profits", label: "Profits" },
  { id: "custom", label: "Custom source" },
  { id: "dropship", label: "Dropship (CJ)" },
  { id: "subscription", label: "Subscriptions" },
  { id: "withdrawals", label: "Withdrawals" },
] as const;

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

function MetricCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "amber" | "emerald" | "sky" | "rose";
}) {
  const toneClass =
    tone === "amber"
      ? "border-amber-200 bg-amber-50/60"
      : tone === "emerald"
        ? "border-emerald-200 bg-emerald-50/50"
        : tone === "sky"
          ? "border-sky-200 bg-sky-50/60"
          : tone === "rose"
            ? "border-rose-200 bg-rose-50/50"
            : "border-zinc-200 bg-white";

  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-zinc-950">{value}</p>
      {hint ? <p className="mt-1 text-sm text-zinc-500">{hint}</p> : null}
    </div>
  );
}

function Section({
  id,
  title,
  description,
  accent = "zinc",
  children,
}: {
  id: string;
  title: string;
  description: string;
  accent?: "zinc" | "sky";
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className={`scroll-mt-6 space-y-4 rounded-2xl border p-5 ${
        accent === "sky"
          ? "border-sky-200 bg-sky-50/30"
          : "border-zinc-200 bg-white"
      }`}
    >
      <div className="space-y-1">
        <h2
          className={`text-lg font-semibold tracking-tight ${
            accent === "sky" ? "text-sky-950" : "text-zinc-950"
          }`}
        >
          {title}
        </h2>
        <p className="max-w-2xl text-sm text-zinc-600">{description}</p>
      </div>
      {children}
    </section>
  );
}

function IncomeCards({
  summary,
  accent,
}: {
  summary: VendorFinanceSnapshot["custom"];
  accent: "zinc" | "sky";
}) {
  const pct = Math.round(summary.commission_rate * 1000) / 10;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        label="Gross revenue"
        value={formatMoney(summary.gross_revenue_usdt, "USDT")}
        hint={`${summary.order_count} paid order${summary.order_count === 1 ? "" : "s"}`}
      />
      <MetricCard
        label="Product cost"
        value={formatMoney(summary.product_cost_usdt, "USDT")}
        hint={
          accent === "sky"
            ? "CJ / supplier cost on resales"
            : "Not applied on direct custom sales"
        }
        tone={accent === "sky" ? "sky" : "default"}
      />
      <MetricCard
        label="Platform commission"
        value={formatMoney(summary.platform_commission_usdt, "USDT")}
        hint={`Universal ${pct}% of GMV`}
        tone="rose"
      />
      <MetricCard
        label="Net profit"
        value={formatMoney(summary.net_profit_usdt, "USDT")}
        hint="Gross − cost − commission"
        tone="emerald"
      />
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
      <p className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-500">
        {empty}
      </p>
    );
  }

  return (
    <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white">
      {rows.map((tx) => (
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
                  : tx.note || "—"}
            </p>
          </div>
          <p className="font-medium text-zinc-950">
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
  const usdt = snapshot.wallets.find((wallet) => wallet.currency === "USDT");
  const mmk = snapshot.wallets.find((wallet) => wallet.currency === "MMK");
  const commissionPct = Math.round(snapshot.commission_rate * 1000) / 10;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Wallet
        </p>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          Wallet & earnings
        </h1>
        <p className="max-w-2xl text-zinc-600">
          Standalone finance view with separate Custom Source, Dropship (CJ),
          subscription, and withdrawal streams — no mixed totals.
        </p>
      </div>

      <nav
        className="flex flex-wrap gap-2"
        aria-label="Wallet sections"
      >
        {SECTIONS.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
              item.id === "dropship" || item.id === "subscription"
                ? "border-sky-200 bg-sky-50 text-sky-950 hover:border-sky-300"
                : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:text-zinc-950"
            }`}
          >
            {item.label}
          </a>
        ))}
      </nav>

      <Section
        id="balances"
        title="Balances & escrow"
        description="Live wallet balances. Escrow stays locked until delivery is confirmed."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="USDT available"
            value={formatMoney(snapshot.available_usdt, "USDT")}
            hint={`MMK: ${formatMoney(snapshot.available_mmk, "MMK")}`}
            tone="emerald"
          />
          <MetricCard
            label="Pending / escrow"
            value={formatMoney(snapshot.escrow_usdt, "USDT")}
            hint={`Withdrawal pending: ${formatMoney(snapshot.pending_usdt, "USDT")}`}
            tone="amber"
          />
          <MetricCard
            label="Platform commission"
            value={formatMoney(
              snapshot.totals.platform_commission_usdt,
              "USDT",
            )}
            hint={`Universal ${commissionPct}% across paid sales`}
            tone="rose"
          />
          <MetricCard
            label="CJ subscriptions paid"
            value={formatMoney(snapshot.subscriptions.paid_usdt, "USDT")}
            hint={`${snapshot.subscriptions.invoice_count} invoice${snapshot.subscriptions.invoice_count === 1 ? "" : "s"}`}
            tone="sky"
          />
        </div>
      </Section>

      <Section
        id="profits"
        title="Net profit vs gross revenue"
        description="Combined profit picture with streams still broken out below so Custom Source and CJ never mix in the detail sections."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Gross revenue"
            value={formatMoney(snapshot.totals.gross_revenue_usdt, "USDT")}
            hint={`${snapshot.totals.order_count} paid orders total`}
          />
          <MetricCard
            label="Product cost"
            value={formatMoney(snapshot.totals.product_cost_usdt, "USDT")}
            hint="Primarily CJ supplier cost"
            tone="sky"
          />
          <MetricCard
            label="Platform commission"
            value={formatMoney(
              snapshot.totals.platform_commission_usdt,
              "USDT",
            )}
            hint={`${commissionPct}% universal rate`}
            tone="rose"
          />
          <MetricCard
            label="Net profit"
            value={formatMoney(snapshot.totals.net_profit_usdt, "USDT")}
            hint="Gross − cost − commission"
            tone="emerald"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <a
            href="#custom"
            className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 transition hover:border-zinc-300"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Custom source net
            </p>
            <p className="mt-2 text-xl font-semibold text-zinc-950">
              {formatMoney(snapshot.custom.net_profit_usdt, "USDT")}
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              Gross {formatMoney(snapshot.custom.gross_revenue_usdt, "USDT")}
            </p>
          </a>
          <a
            href="#dropship"
            className="rounded-xl border border-sky-200 bg-sky-50/60 p-4 transition hover:border-sky-300"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-800/80">
              Dropship (CJ) net
            </p>
            <p className="mt-2 text-xl font-semibold text-zinc-950">
              {formatMoney(snapshot.dropship.net_profit_usdt, "USDT")}
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              Cost {formatMoney(snapshot.dropship.product_cost_usdt, "USDT")}
            </p>
          </a>
        </div>
      </Section>

      <Section
        id="custom"
        title="Custom source income & profits"
        description="Manually sourced products only. Universal 10% platform commission applies; CJ inventory subscriptions do not."
      >
        <IncomeCards summary={snapshot.custom} accent="zinc" />
      </Section>

      <Section
        id="dropship"
        title="Dropship income & profits (CJ)"
        description="CJ Dropshipping orders only — revenue, supplier product cost, platform commission, and net. Custom-source sales are excluded."
        accent="sky"
      >
        <IncomeCards summary={snapshot.dropship} accent="sky" />
        <p className="text-sm text-zinc-600">
          Manage CJ catalog in the{" "}
          <Link href="/vendor/dropship" className="font-medium underline">
            CJ Dropshipping portal
          </Link>
          .
        </p>
      </Section>

      <Section
        id="subscription"
        title="Subscription expenses (CJ)"
        description="Monthly inventory subscription fees for the CJ Dropshipping portal only. Manual products are never billed here."
        accent="sky"
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard
            label="Paid"
            value={formatMoney(snapshot.subscriptions.paid_usdt, "USDT")}
            tone="emerald"
          />
          <MetricCard
            label="Pending"
            value={formatMoney(snapshot.subscriptions.pending_usdt, "USDT")}
            tone="amber"
          />
          <MetricCard
            label="Failed"
            value={formatMoney(snapshot.subscriptions.failed_usdt, "USDT")}
            tone="rose"
          />
        </div>

        {snapshot.subscriptions.invoices.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-8 text-center text-sm text-zinc-500">
            No CJ subscription invoices yet.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white">
            {snapshot.subscriptions.invoices.map((invoice) => (
              <li
                key={invoice.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-zinc-950">
                      {formatMonth(invoice.billing_month)}
                    </p>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statusClass(invoice.status)}`}
                    >
                      {invoice.status}
                    </span>
                  </div>
                  <p className="text-zinc-500">
                    {invoice.billable_item_count} billable items ·{" "}
                    {formatMoney(invoice.unit_fee_usdt, "USDT")} / item
                  </p>
                </div>
                <p className="font-medium text-zinc-950">
                  {formatMoney(invoice.amount_usdt, "USDT")}
                </p>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-3">
          <h3 className="text-base font-semibold tracking-tight">
            Subscription ledger
          </h3>
          <TxList
            rows={snapshot.inventory_fee_txs}
            empty="No CJ subscription wallet charges yet."
          />
        </div>

        <p className="text-sm text-zinc-600">
          Pay or review fees in{" "}
          <Link href="/vendor/fees" className="font-medium underline">
            Dropship fees
          </Link>
          .
        </p>
      </Section>

      <Section
        id="withdrawals"
        title="Withdrawals & balances"
        description="Deposit USDT, request withdrawals, and review escrow releases. Only available balance can be withdrawn."
      >
        {!kycApproved ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            Withdrawals stay locked until KYC is approved.{" "}
            <Link href="/vendor/kyc" className="font-medium underline">
              Submit or check KYC
            </Link>
            .
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="USDT available"
            value={formatMoney(snapshot.available_usdt, "USDT")}
            tone="emerald"
          />
          <MetricCard
            label="USDT pending"
            value={formatMoney(snapshot.pending_usdt, "USDT")}
            hint="Withdrawal requests awaiting review"
            tone="amber"
          />
          <MetricCard
            label="USDT escrow"
            value={formatMoney(snapshot.escrow_usdt, "USDT")}
            hint="Held until order delivered"
            tone="amber"
          />
          <MetricCard
            label="MMK available"
            value={formatMoney(snapshot.available_mmk, "MMK")}
            hint="Withdraw-only · no MMK deposits"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard
            label="Withdrawals completed"
            value={formatMoney(snapshot.withdrawals.completed_usdt, "USDT")}
            tone="emerald"
          />
          <MetricCard
            label="Withdrawals pending"
            value={formatMoney(snapshot.withdrawals.pending_usdt, "USDT")}
            tone="amber"
          />
          <MetricCard
            label="Withdrawals rejected"
            value={formatMoney(snapshot.withdrawals.rejected_usdt, "USDT")}
            tone="rose"
          />
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

        <div className="space-y-3">
          <h3 className="text-base font-semibold tracking-tight">
            Withdrawal history
          </h3>
          <TxList
            rows={snapshot.withdrawals.history}
            empty="No withdrawals yet."
          />
        </div>

        <div className="space-y-3">
          <h3 className="text-base font-semibold tracking-tight">
            Escrow activity
          </h3>
          <TxList
            rows={snapshot.escrow_txs}
            empty="No escrow holds or releases yet."
          />
        </div>
      </Section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Recent wallet activity
        </h2>
        <TxList
          rows={snapshot.transactions.slice(0, 25)}
          empty="No wallet transactions yet."
        />
      </section>
    </div>
  );
}
