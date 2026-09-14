import { redirect } from "next/navigation";
import { ChargeAllInventoryFeesButton } from "@/components/fees/charge-all-fees-button";
import { getSessionProfile, canAccessAdmin } from "@/lib/auth/session";
import {
  getDropshipFeeSettings,
  getPlatformCommissionTotals,
  listAllDropshipInventoryFeeInvoices,
} from "@/lib/fees/queries";
import { formatMoney } from "@/lib/money";

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
    redirect("/");
  }

  const [settings, invoices, commissions] = await Promise.all([
    getDropshipFeeSettings(),
    listAllDropshipInventoryFeeInvoices(),
    getPlatformCommissionTotals(),
  ]);

  const itemFee = settings?.item_fee_usdt ?? 1;
  const minItems = settings?.min_billable_items ?? 10;
  const commissionPct =
    Math.round((settings?.commission_rate ?? 0.03) * 1000) / 10;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Dropship fees
        </h1>
        <p className="max-w-2xl text-zinc-600">
          Inventory fee: {formatMoney(itemFee, "USDT")} per active item (minimum{" "}
          {minItems} items / {formatMoney(itemFee * minItems, "USDT")}/mo).
          Platform commission: {commissionPct}% on completed dropship
          transactions. Wallet rules stay USDT deposit+withdraw, MMK
          withdraw-only.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Platform commissions collected
          </p>
          <p className="mt-2 text-2xl font-semibold text-zinc-950">
            {formatMoney(commissions.commission_usdt, "USDT")}
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            Across {commissions.order_count} dropship order
            {commissions.order_count === 1 ? "" : "s"}
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
