import Link from "next/link";
import { VendorStatusBadge } from "@/components/vendors/admin-vendor-list";
import { getSessionProfile } from "@/lib/auth/session";
import {
  getVendorDropshipCommissionSummary,
  previewDropshipInventoryFee,
} from "@/lib/fees/queries";
import { formatMoney } from "@/lib/money";
import { getVendorForOwner } from "@/lib/vendors/queries";

export const dynamic = "force-dynamic";

export default async function VendorDashboardPage() {
  const session = await getSessionProfile();
  const vendor = session ? await getVendorForOwner(session.userId) : null;

  if (!vendor) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Vendor dashboard</h1>
        <p className="text-zinc-600">
          You do not have a store application yet. Submit one to start selling after
          admin approval.
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

  const [feePreview, commissions] = await Promise.all([
    previewDropshipInventoryFee(vendor.id),
    getVendorDropshipCommissionSummary(vendor.id),
  ]);
  const commissionPct =
    Math.round((commissions.commission_rate || 0.03) * 1000) / 10;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{vendor.name}</h1>
          <VendorStatusBadge status={vendor.status} />
        </div>
        <p className="text-zinc-600">
          Public store:{" "}
          <Link href={`/store/${vendor.slug}`} className="font-medium underline">
            /store/{vendor.slug}
          </Link>
          {" · "}
          <Link href="/vendor/settings" className="font-medium underline">
            Edit branding
          </Link>
        </p>
      </div>

      {vendor.status === "pending" ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Your application is pending admin review. You can explore the vendor area,
          but products will not appear on the storefront until you are approved.
        </div>
      ) : null}

      {vendor.status === "rejected" ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          Your application was rejected. Contact support if you believe this was a
          mistake.
        </div>
      ) : null}

      {vendor.status === "suspended" ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
          Your store is suspended. Contact an admin to restore access.
        </div>
      ) : null}

      {vendor.status === "approved" ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Your store is approved. Manage products and orders from the sidebar.
        </div>
      ) : null}

      {vendor.description ? (
        <p className="max-w-2xl text-zinc-600">{vendor.description}</p>
      ) : null}

      {feePreview?.is_dropshipper ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Monthly inventory fee
            </p>
            <p className="mt-2 text-2xl font-semibold text-zinc-950">
              {formatMoney(feePreview.amount_usdt, "USDT")}
            </p>
            <p className="mt-2 text-sm text-zinc-600">
              {feePreview.active_item_count} active → {feePreview.billable_item_count}{" "}
              billable (min {feePreview.min_billable_items})
              {feePreview.invoice_status
                ? ` · ${feePreview.invoice_status}`
                : ""}
            </p>
            <Link
              href="/vendor/fees"
              className="mt-3 inline-flex text-sm font-medium underline"
            >
              View fees & payouts
            </Link>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Dropship commissions paid
            </p>
            <p className="mt-2 text-2xl font-semibold text-zinc-950">
              {formatMoney(commissions.commission_usdt, "USDT")}
            </p>
            <p className="mt-2 text-sm text-zinc-600">
              {commissionPct}% platform fee across {commissions.order_count} paid
              dropship order{commissions.order_count === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
