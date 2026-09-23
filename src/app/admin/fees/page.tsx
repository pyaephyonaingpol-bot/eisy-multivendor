import { redirect } from "next/navigation";
import { ChargeAllInventoryFeesButton } from "@/components/fees/charge-all-fees-button";
import { ImportLimitSettingsForm } from "@/components/import-limits/import-limit-settings-form";
import { getSessionProfile, canAccessAdmin } from "@/lib/auth/session";
import {
  getDropshipFeeSettings,
  getPlatformCommissionTotals,
  listAllDropshipInventoryFeeInvoices,
  listDropshipFeeChargeRuns,
} from "@/lib/fees/queries";
import { listPlanImportLimits } from "@/lib/import-limits/queries";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/datetime";

export const dynamic = "force-dynamic";

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

export default async function AdminFeesPage() {
  const session = await getSessionProfile();

  if (!session) {
    redirect("/login?next=/admin/fees");
  }

  if (!canAccessAdmin(session.role)) {
    redirect("/unauthorized?from=admin");
  }

  const [settings, invoices, commissions, chargeRuns, planLimits] =
    await Promise.all([
      getDropshipFeeSettings(),
      listAllDropshipInventoryFeeInvoices(),
      getPlatformCommissionTotals(),
      listDropshipFeeChargeRuns(10),
      listPlanImportLimits(),
    ]);

  const itemFee = settings?.item_fee_usdt ?? 1;
  const minItems = settings?.min_billable_items ?? 10;
  const commissionPct =
    Math.round((settings?.commission_rate ?? 0.1) * 1000) / 10;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          CJ Dropshipping fees
        </h1>
        <p className="max-w-2xl text-zinc-600">
          CJ inventory fee: {formatMoney(itemFee, "USDT")} per active CJ import
          (minimum {minItems} items / {formatMoney(itemFee * minItems, "USDT")}
          /mo). Manual / custom-sourced products are exempt from inventory fees.
          Platform commission is a universal {commissionPct}% on all sales
          (manual/custom and CJ). A Vercel Cron job runs on the 1st of each
          month at 01:00 UTC; you can also trigger billing manually below.
        </p>
      </div>

      <ImportLimitSettingsForm
        defaultMaxImportItems={settings?.default_max_import_items ?? 100}
        minBillableItems={minItems}
        planLimits={planLimits}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Platform commissions collected
          </p>
          <p className="mt-2 text-2xl font-semibold text-zinc-950">
            {formatMoney(commissions.commission_usdt, "USDT")}
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            Across {commissions.order_count} paid order
            {commissions.order_count === 1 ? "" : "s"} (manual + CJ)
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Monthly billing run
          </p>
          <p className="mt-2 text-sm text-zinc-600">
            Charges every approved dropshipper with active listings for the
            current calendar month.
          </p>
          <div className="mt-4">
            <ChargeAllInventoryFeesButton />
          </div>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Automated / manual charge runs
        </h2>
        {chargeRuns.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-8 text-center text-sm text-zinc-500">
            No charge runs logged yet. Cron or a manual billing pass will appear
            here with paid/failed/skipped counts.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white">
            {chargeRuns.map((run) => (
              <li
                key={run.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <div className="space-y-1">
                  <p className="font-medium text-zinc-950">
                    {formatMonth(run.billing_month)} · {run.trigger_source}
                  </p>
                  <p className="text-zinc-500">
                    {run.paid_count} paid · {run.failed_count} failed ·{" "}
                    {run.skipped_count} skipped
                    {run.note ? ` · ${run.note}` : ""}
                  </p>
                  <p className="text-xs text-zinc-400">
                    Started {formatDateTime(run.started_at)}
                    {run.finished_at
                      ? ` · finished ${formatDateTime(run.finished_at)}`
                      : " · in progress"}
                  </p>
                </div>
                <p className="font-medium text-zinc-950">
                  {formatMoney(run.total_charged_usdt, "USDT")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Inventory fee invoices
        </h2>
        {invoices.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-8 text-center text-sm text-zinc-500">
            No invoices yet. Run a billing pass after dropshippers activate
            listings.
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
                    {invoice.vendor_name ?? invoice.vendor_id} ·{" "}
                    {formatMonth(invoice.billing_month)}
                  </p>
                  <p className="text-zinc-500">
                    {invoice.active_item_count} active →{" "}
                    {invoice.billable_item_count} billable
                    {invoice.note ? ` · ${invoice.note}` : ""}
                    {invoice.charge_run_id
                      ? ` · run ${invoice.charge_run_id.slice(0, 8)}`
                      : ""}
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
