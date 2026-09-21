import Link from "next/link";
import { AdminDisputeList } from "@/components/disputes/admin-dispute-list";
import {
  countOpenDisputes,
  listDisputesForAdmin,
} from "@/lib/disputes/queries";
import type { DisputeStatus, FulfillmentChannel } from "@/lib/types/database";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ status?: string; channel?: string }>;
};

export default async function AdminDisputesPage({ searchParams }: Props) {
  const params = await searchParams;
  const statusFilter =
    params.status === "open" ||
    params.status === "under_review" ||
    params.status === "resolved_refund" ||
    params.status === "resolved_release"
      ? (params.status as DisputeStatus)
      : undefined;

  const channelFilter: FulfillmentChannel | undefined =
    params.channel === "cj" || params.channel === "manual"
      ? params.channel
      : undefined;

  const disputes = await listDisputesForAdmin(statusFilter, channelFilter);
  const openCount = await countOpenDisputes(channelFilter);
  const openManual = await countOpenDisputes("manual");
  const openCj = await countOpenDisputes("cj");

  const channelQs = channelFilter ? `&channel=${channelFilter}` : "";
  const statusFilters = [
    {
      href: channelFilter
        ? `/admin/disputes?channel=${channelFilter}`
        : "/admin/disputes",
      label: "All statuses",
    },
    {
      href: `/admin/disputes?status=open${channelQs}`,
      label: `Open queue (${openCount})`,
    },
    {
      href: `/admin/disputes?status=under_review${channelQs}`,
      label: "Under review",
    },
    {
      href: `/admin/disputes?status=resolved_refund${channelQs}`,
      label: "Refunded",
    },
    {
      href: `/admin/disputes?status=resolved_release${channelQs}`,
      label: "Released",
    },
  ];

  const channelFilters = [
    { href: "/admin/disputes", label: "All channels" },
    {
      href: "/admin/disputes?channel=manual",
      label: `Manual / custom (${openManual} open)`,
    },
    {
      href: "/admin/disputes?channel=cj",
      label: `CJ Dropshipping (${openCj} open)`,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Dispute &amp; complaint management
        </h1>
        <p className="text-zinc-600">
          Separate queues for manual/custom sourcing complaints versus CJ
          Dropshipping order disputes. Escrow stays paused until you resolve.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        {channelFilters.map((filter) => {
          const active =
            (filter.href.includes("channel=manual") &&
              channelFilter === "manual") ||
            (filter.href.includes("channel=cj") && channelFilter === "cj") ||
            (filter.href === "/admin/disputes" && !channelFilter);
          return (
            <Link
              key={filter.href}
              href={filter.href}
              className={`rounded-full border px-3 py-1 ${
                active
                  ? "border-zinc-900 bg-zinc-950 text-white"
                  : "border-zinc-200 hover:bg-zinc-50"
              }`}
            >
              {filter.label}
            </Link>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        {statusFilters.map((filter) => (
          <Link
            key={filter.href}
            href={filter.href}
            className="rounded-full border border-zinc-200 px-3 py-1 hover:bg-zinc-50"
          >
            {filter.label}
          </Link>
        ))}
      </div>

      {channelFilter ? (
        <p className="text-sm text-zinc-500">
          Showing{" "}
          <strong>
            {channelFilter === "cj" ? "CJ Dropshipping" : "manual / custom"}
          </strong>{" "}
          complaints only.
        </p>
      ) : null}

      <AdminDisputeList disputes={disputes} />
    </div>
  );
}
