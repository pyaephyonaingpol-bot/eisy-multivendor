import Link from "next/link";
import { AdminKycList } from "@/components/vendors/admin-kyc-list";
import { listVendorsForKycAdmin } from "@/lib/vendors/queries";
import type { VendorKycStatus } from "@/lib/types/database";

export const dynamic = "force-dynamic";

type AdminKycPageProps = {
  searchParams: Promise<{ status?: string }>;
};

export default async function AdminKycPage({ searchParams }: AdminKycPageProps) {
  const params = await searchParams;
  const statusFilter =
    params.status === "pending" ||
    params.status === "approved" ||
    params.status === "rejected"
      ? (params.status as VendorKycStatus)
      : undefined;

  const vendors = await listVendorsForKycAdmin(statusFilter);
  const pendingCount = (await listVendorsForKycAdmin("pending")).length;

  const filters = [
    { href: "/admin/kyc", label: "All submissions" },
    { href: "/admin/kyc?status=pending", label: `Pending (${pendingCount})` },
    { href: "/admin/kyc?status=approved", label: "Approved" },
    { href: "/admin/kyc?status=rejected", label: "Rejected" },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Seller KYC review</h1>
        <p className="text-zinc-600">
          Approve or reject vendor and dropshipper identity documents. Unverified
          sellers cannot publish products or withdraw wallet funds.
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

      <AdminKycList vendors={vendors} />
    </div>
  );
}
