import Link from "next/link";
import { listVendorsForAdmin } from "@/lib/vendors/queries";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const pending = await listVendorsForAdmin("pending");

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Admin dashboard</h1>
        <p className="text-zinc-600">
          Approve vendors, review orders, and manage subscriptions.
        </p>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <p className="text-sm uppercase tracking-wide text-zinc-500">Pending vendors</p>
        <p className="mt-2 text-3xl font-semibold tracking-tight">{pending.length}</p>
        <Link
          href="/admin/vendors?status=pending"
          className="mt-4 inline-flex text-sm font-medium underline"
        >
          Review applications
        </Link>
      </div>
    </div>
  );
}
