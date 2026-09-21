import { VendorDisputesPanel } from "@/components/vendors/vendor-disputes-panel";

export const dynamic = "force-dynamic";

/** Custom-source disputes for the Independent Vendor workspace. */
export default function VendorDisputesPage() {
  return (
    <VendorDisputesPanel
      channel="manual"
      title="Disputes"
      description="Buyer disputes for your custom-sourced orders."
      emptyLabel="No disputes yet."
    />
  );
}
