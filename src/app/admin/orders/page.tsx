import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminOrdersTable } from "@/components/orders/admin-orders-table";
import { canAccessAdmin, getSessionProfile } from "@/lib/auth/session";
import {
  listOrdersForAdmin,
  listVendorsForOrderFilter,
} from "@/lib/orders/queries";
import {
  ADMIN_ESCROW_STATUSES,
  adminEscrowStatusLabel,
  type AdminEscrowStatus,
} from "@/lib/orders/status";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    vendor?: string;
    q?: string;
    escrow?: string;
    channel?: string;
  }>;
};

export default async function AdminOrdersPage({ searchParams }: Props) {
  const session = await getSessionProfile();
  if (!session) {
    redirect("/login?next=/admin/orders");
  }
  if (!canAccessAdmin(session.role)) {
    redirect("/unauthorized?from=admin");
  }

  const params = await searchParams;
  const vendorId = params.vendor?.trim() || undefined;
  const q = params.q?.trim() || undefined;
  const channelFilter =
    params.channel === "cj" || params.channel === "manual"
      ? params.channel
      : undefined;
  const escrowFilter = ADMIN_ESCROW_STATUSES.includes(
    params.escrow as AdminEscrowStatus,
  )
    ? (params.escrow as AdminEscrowStatus)
    : undefined;

  const [orders, vendors] = await Promise.all([
    listOrdersForAdmin({
      vendorId,
      q,
      escrowStatus: escrowFilter,
      fulfillmentChannel: channelFilter,
      limit: 150,
    }),
    listVendorsForOrderFilter(),
  ]);

  const selectedVendor = vendorId
    ? vendors.find((vendor) => vendor.id === vendorId)
    : null;

  const escrowFilters = [
    {
      href: buildHref({ vendor: vendorId, q, channel: channelFilter }),
      label: "All",
      active: !escrowFilter,
    },
    ...ADMIN_ESCROW_STATUSES.map((status) => ({
      href: buildHref({
        vendor: vendorId,
        q,
        escrow: status,
        channel: channelFilter,
      }),
      label: adminEscrowStatusLabel(status),
      active: escrowFilter === status,
    })),
  ];

  const channelFilters = [
    {
      href: buildHref({ vendor: vendorId, q, escrow: escrowFilter }),
      label: "All channels",
      active: !channelFilter,
    },
    {
      href: buildHref({
        vendor: vendorId,
        q,
        escrow: escrowFilter,
        channel: "manual",
      }),
      label: "Manual / custom",
      active: channelFilter === "manual",
    },
    {
      href: buildHref({
        vendor: vendorId,
        q,
        escrow: escrowFilter,
        channel: "cj",
      }),
      label: "CJ Dropshipping",
      active: channelFilter === "cj",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Orders &amp; vendor tracking
        </h1>
        <p className="text-zinc-600">
          Monitor every order with buyer email, store Telegram, assigned USDT
          deposit address, on-chain TxID, and escrow status. Filter by manual
          vs CJ Dropshipping fulfillment channels.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        {channelFilters.map((filter) => (
          <Link
            key={filter.href}
            href={filter.href}
            className={`rounded-full border px-3 py-1 ${
              filter.active
                ? "border-zinc-900 bg-zinc-950 text-white"
                : "border-zinc-200 hover:bg-zinc-50"
            }`}
          >
            {filter.label}
          </Link>
        ))}
      </div>

      <form
        method="get"
        className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 sm:flex-row sm:flex-wrap sm:items-end"
      >
        {escrowFilter ? (
          <input type="hidden" name="escrow" value={escrowFilter} />
        ) : null}
        {channelFilter ? (
          <input type="hidden" name="channel" value={channelFilter} />
        ) : null}

        <label className="min-w-[12rem] flex-1 space-y-1 text-sm">
          <span className="font-medium text-zinc-700">Search</span>
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Order ID, buyer email, vendor, TxID…"
            className="w-full rounded-lg border border-zinc-200 px-3 py-2"
          />
        </label>

        <label className="min-w-[12rem] flex-1 space-y-1 text-sm">
          <span className="font-medium text-zinc-700">Filter by vendor</span>
          <select
            name="vendor"
            defaultValue={vendorId ?? ""}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2"
          >
            <option value="">All vendors</option>
            {vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.store_name || vendor.name}
              </option>
            ))}
          </select>
        </label>

        <label className="min-w-[12rem] flex-1 space-y-1 text-sm">
          <span className="font-medium text-zinc-700">Escrow status</span>
          <select
            name="escrow"
            defaultValue={escrowFilter ?? ""}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2"
          >
            <option value="">All statuses</option>
            {ADMIN_ESCROW_STATUSES.map((status) => (
              <option key={status} value={status}>
                {adminEscrowStatusLabel(status)} ({status})
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          className="rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Apply
        </button>
        {(vendorId || q || escrowFilter || channelFilter) && (
          <Link
            href="/admin/orders"
            className="rounded-lg border border-zinc-200 px-4 py-2 text-sm hover:bg-zinc-50"
          >
            Clear
          </Link>
        )}
      </form>

      {selectedVendor ? (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
          Showing orders for{" "}
          <span className="font-semibold">
            {selectedVendor.store_name || selectedVendor.name}
          </span>
          .
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 text-sm">
        {escrowFilters.map((filter) => (
          <Link
            key={filter.href + filter.label}
            href={filter.href}
            className={`rounded-full border px-3 py-1 ${
              filter.active
                ? "border-zinc-900 bg-zinc-950 text-white"
                : "border-zinc-200 hover:bg-zinc-50"
            }`}
          >
            {filter.label}
          </Link>
        ))}
      </div>

      <p className="text-sm text-zinc-500">
        {orders.length} order{orders.length === 1 ? "" : "s"}
        {channelFilter
          ? ` · ${channelFilter === "cj" ? "CJ" : "manual"} channel`
          : ""}
      </p>

      <AdminOrdersTable orders={orders} />
    </div>
  );
}

function buildHref(opts: {
  vendor?: string;
  q?: string;
  escrow?: string;
  channel?: string;
}) {
  const params = new URLSearchParams();
  if (opts.vendor) params.set("vendor", opts.vendor);
  if (opts.q) params.set("q", opts.q);
  if (opts.escrow) params.set("escrow", opts.escrow);
  if (opts.channel) params.set("channel", opts.channel);
  const qs = params.toString();
  return qs ? `/admin/orders?${qs}` : "/admin/orders";
}
