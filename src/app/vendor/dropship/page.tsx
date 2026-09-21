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
 * Dropshipper workspace hub — Orders, Catalog, and Imported products only.
 * Vendor store ops stay under /vendor/dashboard.
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
          Dropshipper management
        </h1>
        <p className="text-zinc-600">
          Apply as a vendor first, then use this workspace for CJ orders,
          catalog sourcing, and imported products.
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

  const cards = [
    {
      href: "/vendor/dropship/orders",
      title: "Orders",
      body: "CJ Dropshipping API orders — separate from Vendor → Orders.",
    },
    {
      href: "/vendor/sourcing",
      title: "Catalog",
      body: "Browse CJ Dropshipping and import listings into your CJ product list.",
    },
    {
      href: "/vendor/dropship/imported",
      title: "Imported products",
      body: "Manage CJ imports — kept separate from Vendor → Product.",
    },
  ] as const;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-sky-800">
          Dropshipper management
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">
          Dropshipper workspace
        </h1>
        <p className="max-w-2xl text-sm text-zinc-600">
          CJ Dropshipping only: Orders, Catalog, and Imported products. Store
          ops (Product, Store, Orders, Tracking) stay under Vendor management.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
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
              CJ commissions paid
            </p>
            <p className="mt-2 text-2xl font-semibold text-zinc-950">
              {formatMoney(commissions.commission_usdt, "USDT")}
            </p>
            <p className="mt-2 text-sm text-zinc-600">
              {commissionPct}% platform fee across {commissions.order_count} paid
              CJ dropship order{commissions.order_count === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-zinc-600">
        <Link href="/vendor/dropship/tracking" className="underline">
          CJ tracking
        </Link>
        <Link href="/vendor/support?channel=cj" className="underline">
          CJ support
        </Link>
        <Link href="/vendor/integrations" className="underline">
          Supplier panels
        </Link>
        <Link href="/vendor/import" className="underline">
          Import tools
        </Link>
        <Link href="/vendor/dashboard" className="font-medium underline">
          ← Vendor management
        </Link>
      </div>
    </div>
  );
}
