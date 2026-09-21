import Link from "next/link";
import { redirect } from "next/navigation";
import { PayInventoryFeeButton } from "@/components/fees/pay-inventory-fee-button";
import { ImportQuotaBanner } from "@/components/import-limits/import-quota-banner";
import { getSessionProfile, canAccessVendor } from "@/lib/auth/session";
import {
  getVendorDropshipCommissionSummary,
  listDropshipInventoryFeeInvoices,
  previewDropshipInventoryFee,
} from "@/lib/fees/queries";
import { getVendorImportQuota } from "@/lib/import-limits/queries";
import { formatMoney } from "@/lib/money";
import { getVendorForOwner } from "@/lib/vendors/queries";

export const dynamic = "force-dynamic";

function formatMonth(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function statusClass(status: string) {
  switch (status) {
    case "paid":
      return "bg-emerald-50 text-emerald-800 ring-emerald-200";
    case "failed":
      return "bg-red-50 text-red-800 ring-red-200";
    case "waived":
      return "bg-zinc-100 text-zinc-700 ring-zinc-200";
    default:
      return "bg-amber-50 text-amber-900 ring-amber-200";
  }
}

export default async function VendorFeesPage() {
  const session = await getSessionProfile();

  if (!session) {
    redirect("/login?next=/vendor/fees");
  }

  if (!canAccessVendor(session.role)) {
    redirect("/vendor/apply");
  }

  const vendor = await getVendorForOwner(session.userId);
  if (!vendor) {
    redirect("/vendor/apply");
  }

  const [preview, invoices, commissions, quota] = await Promise.all([
    previewDropshipInventoryFee(vendor.id),
    listDropshipInventoryFeeInvoices(vendor.id),
    getVendorDropshipCommissionSummary(vendor.id),
    getVendorImportQuota(vendor.id),
  ]);

  const commissionPct = Math.round((commissions.commission_rate || 0.03) * 1000) / 10;
  const alreadyPaid = preview?.invoice_status === "paid";
  const canPay =
    Boolean(preview?.is_dropshipper) &&
    (preview?.amount_usdt ?? 0) > 0 &&
    !alreadyPaid;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-sky-800">
          Dropshipping workspace
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Fees & payouts</h1>
        <p className="max-w-2xl text-zinc-600">
          CJ Dropshipping imports pay 1 USDT per active CJ listing each month
          (minimum 10 USDT), plus a {commissionPct}% platform commission on
          completed CJ dropship resales. Manual / custom-sourced products and
          orders are never billed inventory fees or fee floors. Payouts settle
          in USDT. Withdraw USDT or MMK from your{" "}
          <Link href="/vendor/wallet" className="underline">
            wallet
          </Link>
          ; MMK remains withdraw-only.
        </p>
        <p className="text-sm text-zinc-500">
          <Link href="/vendor/dropship" className="font-medium underline">
            Dropshipping hub
          </Link>
        </p>
      </div>

      {quota ? <ImportQuotaBanner quota={quota} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Monthly inventory fee
          </p>
          <p className="mt-2 text-2xl font-semibold text-zinc-950">
            {formatMoney(preview?.amount_usdt ?? 0, "USDT")}
          </p>
          <p className="mt-2 text-sm text-zinc-600">
            {preview?.active_item_count ?? 0} active items →{" "}
            {preview?.billable_item_count ?? 0} billable (min{" "}
            {preview?.min_billable_items ?? 10}) ·{" "}
            {formatMonth(preview?.billing_month ?? new Date().toISOString().slice(0, 10))}
          </p>
          {preview?.invoice_status ? (
            <p className="mt-2 text-sm text-zinc-500">
              Status:{" "}
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statusClass(preview.invoice_status)}`}
              >
                {preview.invoice_status}
              </span>
            </p>
          ) : null}
          <div className="mt-4">
            {canPay ? (
              <PayInventoryFeeButton vendorId={vendor.id} />
            ) : (
              <p className="text-sm text-zinc-500">
                {!preview?.is_dropshipper
                  ? "No CJ imports yet — fees apply only to CJ Dropshipping listings. Manual products stay free of inventory fees."
                  : alreadyPaid
                    ? "This month’s CJ inventory fee is paid."
                    : "No CJ inventory fee due (no active CJ imports)."}
              </p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Transaction commissions
          </p>
          <p className="mt-2 text-2xl font-semibold text-zinc-950">
            {formatMoney(commissions.commission_usdt, "USDT")}
          </p>
          <p className="mt-2 text-sm text-zinc-600">
            {commissionPct}% of dropship GMV deducted at checkout alongside supplier
            cost and your markup. Across {commissions.order_count} paid dropship
            order{commissions.order_count === 1 ? "" : "s"} (
            {formatMoney(commissions.gmv_usdt, "USDT")} GMV).
          </p>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Invoice history</h2>
        {invoices.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-8 text-center text-sm text-zinc-500">
            No inventory fee invoices yet.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white">
            {invoices.map((invoice) => (
              <li
                key={invoice.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <div className="space-y-1">
                  <p className="font-medium text-zinc-950">
                    {formatMonth(invoice.billing_month)}
                  </p>
                  <p className="text-zinc-500">
                    {invoice.active_item_count} active → {invoice.billable_item_count}{" "}
                    billable × {formatMoney(invoice.unit_fee_usdt, "USDT")}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statusClass(invoice.status)}`}
                  >
                    {invoice.status}
                  </span>
                  <p className="font-medium text-zinc-950">
                    {formatMoney(invoice.amount_usdt, "USDT")}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
