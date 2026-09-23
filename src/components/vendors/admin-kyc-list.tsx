import { reviewVendorKyc } from "@/lib/vendors/actions";
import { createKycDocumentSignedUrl } from "@/lib/vendors/kyc";
import type { Vendor, VendorKycStatus } from "@/lib/types/database";
import { formatDateTime } from "@/lib/datetime";

const statusStyles: Record<VendorKycStatus, string> = {
  unsubmitted: "bg-zinc-100 text-zinc-700",
  pending: "bg-amber-50 text-amber-900",
  approved: "bg-emerald-50 text-emerald-900",
  rejected: "bg-red-50 text-red-800",
};

type AdminKycListProps = {
  vendors: Vendor[];
};

export async function AdminKycList({ vendors }: AdminKycListProps) {
  if (vendors.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-200 px-4 py-8 text-center text-sm text-zinc-500">
        No KYC submissions match this filter.
      </p>
    );
  }

  const rows = await Promise.all(
    vendors.map(async (vendor) => {
      const signed = vendor.kyc_document_path
        ? await createKycDocumentSignedUrl(vendor.kyc_document_path)
        : { url: vendor.kyc_document_url ?? undefined };
      return { vendor, documentUrl: signed.url ?? null };
    }),
  );

  return (
    <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white">
      {rows.map(({ vendor, documentUrl }) => (
        <li key={vendor.id} className="space-y-4 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="font-medium text-zinc-950">{vendor.name}</p>
              <p className="text-sm text-zinc-500">/{vendor.slug}</p>
              <p className="text-sm text-zinc-600">
                {vendor.kyc_legal_name ?? "—"} ·{" "}
                {vendor.kyc_document_type?.replaceAll("_", " ") ?? "no document"}
                {vendor.kyc_document_number
                  ? ` · #${vendor.kyc_document_number}`
                  : ""}
              </p>
              {vendor.kyc_submitted_at ? (
                <p className="text-xs text-zinc-500">
                  Submitted {formatDateTime(vendor.kyc_submitted_at)}
                </p>
              ) : null}
              {vendor.kyc_status === "rejected" && vendor.kyc_rejection_reason ? (
                <p className="text-sm text-red-700">
                  Rejected: {vendor.kyc_rejection_reason}
                </p>
              ) : null}
            </div>
            <span
              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusStyles[vendor.kyc_status]}`}
            >
              {vendor.kyc_status}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {documentUrl ? (
              <a
                href={documentUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm hover:bg-zinc-50"
              >
                View document
              </a>
            ) : (
              <span className="text-sm text-zinc-400">No document URL</span>
            )}

            {vendor.kyc_status === "pending" ? (
              <>
                <form
                  action={async () => {
                    "use server";
                    await reviewVendorKyc(vendor.id, true);
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
                  action={async (formData) => {
                    "use server";
                    const reason = String(formData.get("rejection_reason") ?? "").trim();
                    await reviewVendorKyc(vendor.id, false, reason || "Incomplete documents");
                  }}
                  className="flex flex-wrap items-center gap-2"
                >
                  <input
                    name="rejection_reason"
                    placeholder="Rejection reason"
                    className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm"
                    required
                  />
                  <button
                    type="submit"
                    className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
                  >
                    Reject
                  </button>
                </form>
              </>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
