import { VendorDisputesPanel } from "@/components/vendors/vendor-disputes-panel";

export const dynamic = "force-dynamic";

/** CJ Dropshipping disputes workspace. */
export default function CjDisputesPage() {
  return (
    <VendorDisputesPanel
      channel="cj"
      title="Disputes"
      description="Buyer disputes for CJ Dropshipping orders."
      emptyLabel="No disputes yet."
    />
  );
}
