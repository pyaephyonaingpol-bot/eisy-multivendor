import { VendorDisputesPanel } from "@/components/vendors/vendor-disputes-panel";

export const dynamic = "force-dynamic";

/** CJ Dropshipping Portal — CJ disputes only. */
export default function CjDisputesPage() {
  return (
    <VendorDisputesPanel
      channel="cj"
      eyebrow="CJ Dropshipping Portal"
      title="CJ Disputes"
      description="Buyer disputes for CJ Dropshipping orders only. Custom-source disputes live in the Independent Vendor Portal."
      emptyLabel="No CJ disputes yet."
    />
  );
}
