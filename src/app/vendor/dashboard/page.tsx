import Link from "next/link";
import { VendorStatusBadge } from "@/components/vendors/admin-vendor-list";
import { getSessionProfile } from "@/lib/auth/session";
import { formatMoney } from "@/lib/money";
import { getVendorForOwner } from "@/lib/vendors/queries";
import { getVendorFinanceSnapshot } from "@/lib/wallets/vendor-finance";

export const dynamic = "force-dynamic";

/**
 * Independent Vendor Portal home — Products, Store, Orders, Tracking, Disputes.
 * CJ Dropshipping is a separate portal at /vendor/dropship.
 */
export default async function VendorDashboardPage() {
  const session = await getSessionProfile();
  const vendor = session ? await getVendorForOwner(session.userId) : null;

  if (!vendor) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          Independent Vendor Portal
        </h1>
        <p className="text-zinc-600">
          You do not have a store application yet. Submit one to start selling
          after admin approval.
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

  const finance =
    session && vendor
      ? await getVendorFinanceSnapshot(session.userId, vendor.id)
      : null;
  const commissionPct = finance
    ? Math.round(finance.commission_rate * 1000) / 10
    : 10;

  const vendorActions = [
    {
      href: "/vendor/products",
      title: "Products",
      body: "Manual / custom-sourced products for your storefront.",
    },
    {
      href: "/vendor/settings",
      title: "Store",
      body: "Store branding, shipping regions, and public storefront settings.",
    },
    {
      href: "/vendor/orders",
      title: "Orders",
      body: "Custom-sourced orders you fulfill yourself.",
    },
    {
      href: "/vendor/tracking",
      title: "Tracking",
      body: "Shipment tracking for local / custom-sourced orders.",
    },
    {
      href: "/vendor/disputes",
      title: "Disputes",
      body: "Buyer disputes for custom-sourced orders only.",
    },
  ] as const;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Independent Vendor Portal
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{vendor.name}</h1>
          <VendorStatusBadge status={vendor.status} />
        </div>
        <p className="text-zinc-600">
          Custom sourcing only — Products, Store, Orders, Tracking, and Disputes.
          CJ Dropshipping is a separate portal.
        </p>
        <p className="text-zinc-600">
          Public store:{" "}
          <Link href={`/store/${vendor.slug}`} className="font-medium underline">
            /store/{vendor.slug}
          </Link>
        </p>
      </div>

      {vendor.status === "pending" ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Your application is pending admin review. Products will not appear on
          the storefront until you are approved.
        </div>
      ) : null}

      {vendor.status === "rejected" ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          Your application was rejected. Contact support if you believe this was
          a mistake.
        </div>
      ) : null}

      {vendor.status === "suspended" ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
          Your store is suspended. Contact an admin to restore access.
        </div>
      ) : null}

      {vendor.status === "approved" ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Store approved. Use this portal for custom-source ops only.
        </div>
      ) : null}

      {vendor.description ? (
        <p className="max-w-2xl text-zinc-600">{vendor.description}</p>
      ) : null}

      {finance ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/vendor/wallet?portal=vendor"
            className="rounded-xl border border-zinc-200 bg-white p-4 transition hover:border-zinc-300"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Custom source net
            </p>
            <p className="mt-2 text-xl font-semibold text-zinc-950">
              {formatMoney(finance.custom.net_profit_usdt, "USDT")}
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              After {commissionPct}% platform fee ·{" "}
              {finance.custom.order_count} orders
            </p>
          </Link>
          <Link
            href="/vendor/wallet?portal=vendor"
            className="rounded-xl border border-zinc-200 bg-white p-4 transition hover:border-zinc-300"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Gross revenue
            </p>
            <p className="mt-2 text-xl font-semibold text-zinc-950">
              {formatMoney(finance.custom.gross_revenue_usdt, "USDT")}
            </p>
            <p className="mt-1 text-sm text-zinc-500">Manual products only</p>
          </Link>
          <Link
            href="/vendor/wallet?portal=vendor"
            className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 transition hover:border-amber-300"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Pending / escrow
            </p>
            <p className="mt-2 text-xl font-semibold text-zinc-950">
              {formatMoney(finance.escrow_usdt, "USDT")}
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              Available {formatMoney(finance.available_usdt, "USDT")}
            </p>
          </Link>
          <Link
            href="/vendor/wallet?portal=vendor"
            className="rounded-xl border border-rose-200 bg-rose-50/40 p-4 transition hover:border-rose-300"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Platform commission
            </p>
            <p className="mt-2 text-xl font-semibold text-zinc-950">
              {formatMoney(finance.custom.platform_commission_usdt, "USDT")}
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              Custom-source deductions only
            </p>
          </Link>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {vendorActions.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group rounded-2xl border border-zinc-200 bg-white p-5 transition hover:border-zinc-300 hover:shadow-sm"
          >
            <h2 className="text-base font-semibold text-zinc-950 group-hover:underline">
              {item.title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">
              {item.body}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
