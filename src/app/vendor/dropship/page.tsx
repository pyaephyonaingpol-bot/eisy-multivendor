import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getVendorDropshipCommissionSummary,
  previewDropshipInventoryFee,
} from "@/lib/fees/queries";
import { formatMoney } from "@/lib/money";
import { canAccessVendor, getSessionProfile } from "@/lib/auth/session";
import { getVendorForOwner } from "@/lib/vendors/queries";

export const dynamic = "force-dynamic";

/**
 * CJ Dropshipping Portal home — Catalog, Imported products, CJ Orders,
 * CJ Tracking, CJ Disputes. Independent Vendor ops stay under /vendor/dashboard.
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

  const [feePreview, commissions] = await Promise.all([
    previewDropshipInventoryFee(vendor.id),
    getVendorDropshipCommissionSummary(vendor.id),
  ]);
  const commissionPct =
    Math.round((commissions.commission_rate || 0.1) * 1000) / 10;

  const cards = [
    {
      href: "/vendor/sourcing",
      title: "Catalog",
      body: "Browse CJ Dropshipping and import listings.",
    },
    {
      href: "/vendor/dropship/imported",
      title: "Imported products",
      body: "Manage CJ imports — separate from Vendor → Products.",
    },
    {
      href: "/vendor/dropship/orders",
      title: "CJ Orders",
      body: "Orders fulfilled through the CJ Dropshipping API.",
    },
    {
      href: "/vendor/dropship/tracking",
      title: "CJ Tracking",
      body: "Supplier tracking numbers and sync status from CJ.",
    },
    {
      href: "/vendor/dropship/disputes",
      title: "CJ Disputes",
      body: "Buyer disputes for CJ orders only.",
    },
  ] as const;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-sky-800">
          CJ Dropshipping Portal
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">
          CJ Dropshipping
        </h1>
        <p className="max-w-2xl text-sm text-zinc-600">
          Catalog, Imported products, CJ Orders, CJ Tracking, and CJ Disputes.
          Custom-source ops stay in the Independent Vendor Portal.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50/90 to-white p-5 transition hover:border-sky-300 hover:shadow-sm"
          >
            <h2 className="text-base font-semibold text-sky-950 group-hover:underline">
              {card.title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-sky-950/75">
              {card.body}
            </p>
          </Link>
        ))}
      </div>

      {feePreview?.is_dropshipper ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-sky-200 bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-sky-800/70">
              Monthly CJ inventory fee
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
            <Link
              href="/vendor/fees"
              className="mt-3 inline-flex text-sm font-medium text-sky-900 underline"
            >
              View CJ fees
            </Link>
          </div>
          <div className="rounded-xl border border-sky-200 bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-sky-800/70">
              Platform commissions paid
            </p>
            <p className="mt-2 text-2xl font-semibold text-zinc-950">
              {formatMoney(commissions.commission_usdt, "USDT")}
            </p>
            <p className="mt-2 text-sm text-zinc-600">
              Universal {commissionPct}% platform fee across{" "}
              {commissions.order_count} paid order
              {commissions.order_count === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
