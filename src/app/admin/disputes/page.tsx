import Link from "next/link";
import { AdminDisputeList } from "@/components/disputes/admin-dispute-list";
import {
  countOpenDisputes,
  listDisputesForAdmin,
} from "@/lib/disputes/queries";
import type { DisputeStatus } from "@/lib/types/database";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ status?: string }>;
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

  const disputes = await listDisputesForAdmin(statusFilter);
  const openCount = await countOpenDisputes();

  const filters = [
    { href: "/admin/disputes", label: "All" },
    { href: "/admin/disputes?status=open", label: `Open queue (${openCount})` },
    { href: "/admin/disputes?status=under_review", label: "Under review" },
    { href: "/admin/disputes?status=resolved_refund", label: "Refunded" },
    { href: "/admin/disputes?status=resolved_release", label: "Released" },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Dispute management
        </h1>
        <p className="text-zinc-600">
          Review buyer disputes that pause escrow. Refund the buyer or release
          funds to the seller when you close a case.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        {filters.map((filter) => (
          <Link
            key={filter.href}
            href={filter.href}
            className="rounded-full border border-zinc-200 px-3 py-1 hover:bg-zinc-50"
          >
            {filter.label}
          </Link>
        ))}
      </div>

      <AdminDisputeList disputes={disputes} />
    </div>
  );
}
