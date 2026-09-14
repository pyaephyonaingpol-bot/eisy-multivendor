import { reviewVendor } from "@/lib/vendors/actions";
import type { Vendor, VendorStatus } from "@/lib/types/database";

const statusStyles: Record<VendorStatus, string> = {
  pending: "bg-amber-50 text-amber-800",
  approved: "bg-emerald-50 text-emerald-800",
  rejected: "bg-red-50 text-red-800",
  suspended: "bg-zinc-100 text-zinc-700",
};

type VendorReviewActionsProps = {
  vendorId: string;
  status: VendorStatus;
};

export function VendorReviewActions({ vendorId, status }: VendorReviewActionsProps) {
  if (status !== "pending" && status !== "approved") {
    return (
      <form
        action={async () => {
          "use server";
          await reviewVendor(vendorId, "approved");
        }}
      >
        <button
          type="submit"
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm hover:bg-zinc-50"
        >
          Re-approve
        </button>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {status === "pending" ? (
        <>
          <form
            action={async () => {
              "use server";
              await reviewVendor(vendorId, "approved");
            }}
          >
            <button
              type="submit"
              className="rounded-lg bg-zinc-950 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Approve
            </button>
          </form>
          <form
            action={async () => {
              "use server";
              await reviewVendor(vendorId, "rejected");
            }}
          >
            <button
              type="submit"
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
            >
              Reject
            </button>
          </form>
        </>
      ) : (
        <form
          action={async () => {
            "use server";
            await reviewVendor(vendorId, "suspended");
          }}
        >
          <button
            type="submit"
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm hover:bg-zinc-50"
          >
            Suspend
          </button>
        </form>
      )}
    </div>
  );
}

type VendorStatusBadgeProps = {
  status: VendorStatus;
};

export function VendorStatusBadge({ status }: VendorStatusBadgeProps) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusStyles[status]}`}
    >
      {status}
    </span>
  );
}

type AdminVendorListProps = {
  vendors: Vendor[];
};

export function AdminVendorList({ vendors }: AdminVendorListProps) {
  if (vendors.length === 0) {
    return <p className="text-sm text-zinc-600">No vendor applications yet.</p>;
  }

  return (
    <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white">
      {vendors.map((vendor) => (
        <li
          key={vendor.id}
          className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <p className="font-medium tracking-tight">{vendor.name}</p>
              <VendorStatusBadge status={vendor.status} />
            </div>
            <p className="text-sm text-zinc-500">/{vendor.slug}</p>
            {vendor.description ? (
              <p className="max-w-xl text-sm text-zinc-600">{vendor.description}</p>
            ) : null}
          </div>
          <VendorReviewActions vendorId={vendor.id} status={vendor.status} />
        </li>
      ))}
    </ul>
  );
}
