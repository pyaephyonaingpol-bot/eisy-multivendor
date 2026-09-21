import { Suspense } from "react";
import { SitePortalFooter } from "@/components/layout/site-portal-footer";
import { VendorBottomNav } from "@/components/vendors/vendor-bottom-nav";
import { VendorPortalHeader } from "@/components/vendors/vendor-portal-header";

/**
 * Seller portals (Independent Vendor + CJ Dropshipping).
 * Navigation is header + fixed bottom bar only — no left sidebar.
 */
export default function VendorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Suspense
        fallback={
          <div className="h-14 border-b border-zinc-200 bg-white/95" />
        }
      >
        <VendorPortalHeader />
      </Suspense>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-5 sm:pb-28 sm:pt-6">
        {children}
      </main>
      <div className="pb-20 sm:pb-24">
        <Suspense fallback={null}>
          <SitePortalFooter
            brandTitle="EISY Seller"
            brandDescription="Switch portals anytime — buyer shop, independent vendor, CJ dropshipping, or admin."
            shopLinks={false}
          />
        </Suspense>
      </div>
      <Suspense fallback={null}>
        <VendorBottomNav />
      </Suspense>
    </>
  );
}
