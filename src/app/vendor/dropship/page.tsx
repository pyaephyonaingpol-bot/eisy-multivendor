import Link from "next/link";
import { redirect } from "next/navigation";
import { previewDropshipInventoryFee } from "@/lib/fees/queries";
import { formatMoney } from "@/lib/money";
import { canAccessVendor, getSessionProfile } from "@/lib/auth/session";
import { getVendorForOwner } from "@/lib/vendors/queries";
import { getVendorFinanceSnapshot } from "@/lib/wallets/vendor-finance";

export const dynamic = "force-dynamic";

/**
 * CJ Dropshipping Portal home — metrics overview.
 * Primary nav is the bottom bar (Catalog, Imported, Orders, Tracking, Wallet).
 * Independent Vendor ops stay under /vendor/dashboard.
 */
export default async function VendorDropshipHubPage() {
  const session = await getSessionProfile();
  if (!session) {
    redirect("/login?next=/vendor/dropship");
  }
  if (!canAccessVendor(session.role)) {
    redirect("/");
  }

  const vendor = await getVendorForOwner(session.userId);
  if (!vendor) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          CJ Dropshipping Portal
        </h1>
        <p className="text-zinc-600">
          Apply as a vendor first, then use this portal for CJ catalog, imports,
          orders, tracking, and disputes.
        </p>
        <Link
          href="/vendor/apply"
          className="inline-flex rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Apply as a vendor
        </Link>
      </div>
    );
  }

  const [feePreview, finance] = await Promise.all([
    previewDropshipInventoryFee(vendor.id),
    getVendorFinanceSnapshot(session.userId, vendor.id),
  ]);
  const commissionPct = Math.round(finance.commission_rate * 1000) / 10;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-sky-800">
          CJ Dropshipping Portal
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">
          Overview
        </h1>
        <p className="max-w-2xl text-sm text-zinc-600">
          CJ finance and subscription at a glance. Use the bottom bar for
          catalog, imports, orders, tracking, and wallet.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          href="/vendor/wallet?portal=cj"
          className="rounded-xl border border-sky-200 bg-white p-4 transition hover:border-sky-300"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-sky-800/70">
            Dropship net profit
          </p>
          <p className="mt-2 text-xl font-semibold text-zinc-950">
            {formatMoney(finance.dropship.net_profit_usdt, "USDT")}
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            CJ orders only · {finance.dropship.order_count} paid
          </p>
        </Link>
        <Link
          href="/vendor/wallet?portal=cj"
          className="rounded-xl border border-sky-200 bg-white p-4 transition hover:border-sky-300"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-sky-800/70">
            Product cost
          </p>
          <p className="mt-2 text-xl font-semibold text-zinc-950">
            {formatMoney(finance.dropship.product_cost_usdt, "USDT")}
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            Gross {formatMoney(finance.dropship.gross_revenue_usdt, "USDT")}
          </p>
        </Link>
        <Link
          href="/vendor/wallet?portal=cj"
          className="rounded-xl border border-sky-200 bg-white p-4 transition hover:border-sky-300"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-sky-800/70">
            Platform commission
          </p>
          <p className="mt-2 text-xl font-semibold text-zinc-950">
            {formatMoney(finance.dropship.platform_commission_usdt, "USDT")}
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            Universal {commissionPct}% on CJ GMV
          </p>
        </Link>
        <Link
          href="/vendor/fees"
          className="rounded-xl border border-sky-200 bg-sky-50/70 p-4 transition hover:border-sky-300"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-sky-800/70">
            Subscription paid
          </p>
          <p className="mt-2 text-xl font-semibold text-zinc-950">
            {formatMoney(finance.subscriptions.paid_usdt, "USDT")}
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            Pending{" "}
            {formatMoney(finance.subscriptions.pending_usdt, "USDT")}
          </p>
        </Link>
      </div>

      {feePreview?.is_dropshipper ? (
        <div className="rounded-xl border border-sky-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-sky-800/70">
            This month&apos;s CJ inventory subscription
          </p>
          <p className="mt-2 text-2xl font-semibold text-zinc-950">
            {formatMoney(feePreview.amount_usdt, "USDT")}
          </p>
          <p className="mt-2 text-sm text-zinc-600">
            {feePreview.active_item_count} active →{" "}
            {feePreview.billable_item_count} billable (min{" "}
            {feePreview.min_billable_items})
            {feePreview.invoice_status
              ? ` · ${feePreview.invoice_status}`
              : ""}
          </p>
          <div className="mt-3 flex flex-wrap gap-3 text-sm">
            <Link
              href="/vendor/fees"
              className="font-medium text-sky-900 underline"
            >
              View CJ fees
            </Link>
            <Link
              href="/vendor/wallet?portal=cj"
              className="font-medium text-sky-900 underline"
            >
              Open finance wallet
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
