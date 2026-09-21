import { VendorDisputesPanel } from "@/components/vendors/vendor-disputes-panel";

export const dynamic = "force-dynamic";

/** Independent Vendor Portal — custom-source disputes only. */
export default function VendorDisputesPage() {
  return (
    <VendorDisputesPanel
      channel="manual"
      eyebrow="Independent Vendor Portal"
      title="Disputes"
      description="Buyer disputes for custom-sourced / manual orders only. CJ Dropshipping disputes live in the CJ portal."
      emptyLabel="No custom-source disputes yet."
    />
  );
}
