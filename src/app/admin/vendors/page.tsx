import Link from "next/link";
import { AdminVendorList } from "@/components/vendors/admin-vendor-list";
import { listVendorsForAdmin } from "@/lib/vendors/queries";

export const dynamic = "force-dynamic";

type AdminVendorsPageProps = {
  searchParams: Promise<{ status?: string }>;
};

export default async function AdminVendorsPage({ searchParams }: AdminVendorsPageProps) {
  const params = await searchParams;
  const statusFilter =
    params.status === "pending" ||
    params.status === "approved" ||
    params.status === "rejected" ||
    params.status === "suspended"
      ? params.status
      : undefined;

  const vendors = await listVendorsForAdmin(statusFilter);
  const pendingCount = (await listVendorsForAdmin("pending")).length;

  const filters = [
    { href: "/admin/vendors", label: "All" },
    { href: "/admin/vendors?status=pending", label: `Pending (${pendingCount})` },
    { href: "/admin/vendors?status=approved", label: "Approved" },
    { href: "/admin/vendors?status=rejected", label: "Rejected" },
    { href: "/admin/vendors?status=suspended", label: "Suspended" },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Vendor applications</h1>
        <p className="text-zinc-600">
          Review pending stores. Approving makes them eligible to appear on the
          public vendors page.
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

      <AdminVendorList vendors={vendors} />
    </div>
  );
}
