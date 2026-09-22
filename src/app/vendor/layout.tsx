import { Suspense } from "react";
import { SitePortalFooter } from "@/components/layout/site-portal-footer";
import { VendorBottomNav } from "@/components/vendors/vendor-bottom-nav";
import { VendorPortalHeader } from "@/components/vendors/vendor-portal-header";

/**
 * Seller shell (Independent Vendor + CJ): sticky header + full-width main + bottom tabs.
 */
export default function VendorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full w-full max-w-full flex-col overflow-x-hidden">
      <Suspense
        fallback={<div className="h-14 border-b border-zinc-100 bg-white" />}
      >
        <VendorPortalHeader />
      </Suspense>
      <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 overflow-x-hidden px-4 pb-28 pt-5 sm:pt-6">
        {children}
      </main>
      <div className="w-full min-w-0 max-w-full overflow-x-hidden pb-20 sm:pb-24">
        <SitePortalFooter />
      </div>
      <Suspense fallback={null}>
        <VendorBottomNav />
      </Suspense>
    </div>
  );
}
