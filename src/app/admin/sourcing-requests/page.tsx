import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminSourcingRequestList } from "@/components/sourcing/admin-sourcing-request-list";
import { canAccessAdmin, getSessionProfile } from "@/lib/auth/session";
import {
  countPendingSourcingRequests,
  listSourcingRequestsForAdmin,
} from "@/lib/sourcing-requests/queries";
import type { SourcingRequestStatus } from "@/lib/types/database";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ status?: string }>;
};

export default async function AdminSourcingRequestsPage({ searchParams }: Props) {
  const session = await getSessionProfile();
  if (!session) {
    redirect("/login?next=/admin/sourcing-requests");
  }
  if (!canAccessAdmin(session.role)) {
    redirect("/unauthorized");
  }

  const params = await searchParams;
  const statusFilter =
    params.status === "pending" ||
    params.status === "reviewing" ||
    params.status === "sourced" ||
    params.status === "rejected" ||
    params.status === "closed"
      ? (params.status as SourcingRequestStatus)
      : undefined;

  const [requests, pendingCount] = await Promise.all([
    listSourcingRequestsForAdmin({ status: statusFilter }),
    countPendingSourcingRequests(),
  ]);

  const filters: Array<{ href: string; label: string }> = [
    { href: "/admin/sourcing-requests", label: "All" },
    { href: "/admin/sourcing-requests?status=pending", label: "Pending" },
    { href: "/admin/sourcing-requests?status=reviewing", label: "Reviewing" },
    { href: "/admin/sourcing-requests?status=sourced", label: "Sourced" },
    { href: "/admin/sourcing-requests?status=rejected", label: "Rejected" },
    { href: "/admin/sourcing-requests?status=closed", label: "Closed" },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Sourcing requests
        </h1>
        <p className="max-w-2xl text-zinc-600">
          Buyer product find requests. CJ catalog matches are attached
          automatically when the product name or URL resolves.
        </p>
        <p className="text-sm text-zinc-500">
          {pendingCount} pending ·{" "}
          <Link href="/admin/dashboard" className="underline">
            Dashboard
          </Link>
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {filters.map((filter) => {
          const active =
            (filter.href === "/admin/sourcing-requests" && !statusFilter) ||
            (statusFilter != null && filter.href.endsWith(`status=${statusFilter}`));
          return (
            <Link
              key={filter.href}
              href={filter.href}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                active
                  ? "bg-zinc-950 text-white"
                  : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
              }`}
            >
              {filter.label}
            </Link>
          );
        })}
      </div>

      <AdminSourcingRequestList requests={requests} />
    </div>
  );
}
