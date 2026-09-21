import Link from "next/link";
import { VendorStatusBadge } from "@/components/vendors/admin-vendor-list";
import { getSessionProfile } from "@/lib/auth/session";
import { getVendorForOwner } from "@/lib/vendors/queries";

export const dynamic = "force-dynamic";

/**
 * Vendor management home — Product, Store, Orders, Tracking only.
 * Dropshipper fees/catalog live under /vendor/dropship (separate workspace).
 */
export default async function VendorDashboardPage() {
  const session = await getSessionProfile();
  const vendor = session ? await getVendorForOwner(session.userId) : null;

  if (!vendor) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Vendor management</h1>
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

  const vendorActions = [
    {
      href: "/vendor/products",
      title: "Product",
      body: "Add and edit manual / custom-sourced products for your storefront.",
    },
    {
      href: "/vendor/settings",
      title: "Store",
      body: "Store branding, shipping regions, and public storefront settings.",
    },
    {
      href: "/vendor/orders",
      title: "Orders",
      body: "Manual / custom-sourced orders you fulfill yourself.",
    },
    {
      href: "/vendor/tracking",
      title: "Tracking",
      body: "Shipment tracking for your local / custom-sourced orders.",
    },
  ] as const;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Vendor management
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{vendor.name}</h1>
          <VendorStatusBadge status={vendor.status} />
        </div>
        <p className="text-zinc-600">
          Public store:{" "}
          <Link href={`/store/${vendor.slug}`} className="font-medium underline">
            /store/{vendor.slug}
          </Link>
        </p>
      </div>

      {vendor.status === "pending" ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Your application is pending admin review. You can explore Vendor
          management, but products will not appear on the storefront until you
          are approved.
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
          Your store is approved. Manage Product, Store, Orders, and Tracking
          here. CJ Dropshipping lives in a separate Dropshipper workspace.
        </div>
      ) : null}

      {vendor.description ? (
        <p className="max-w-2xl text-zinc-600">{vendor.description}</p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
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

      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-zinc-600">
        <Link href="/vendor/profile" className="underline">
          Profile & settings
        </Link>
        <Link href="/vendor/kyc" className="underline">
          KYC
        </Link>
        <Link href="/vendor/wallet" className="underline">
          Wallet
        </Link>
        <Link
          href="/vendor/dropship"
          className="font-medium text-sky-800 underline"
        >
          Open Dropshipper workspace
        </Link>
      </div>
    </div>
  );
}
