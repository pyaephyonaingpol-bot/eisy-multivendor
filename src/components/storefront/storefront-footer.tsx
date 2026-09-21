import { Suspense } from "react";
import { SitePortalFooter } from "@/components/layout/site-portal-footer";

/**
 * Buyer storefront footer — shop links only (no Portals card grid).
 * Portal switching lives in the Account menu / bottom nav.
 */
export function StorefrontFooter() {
  return (
    <Suspense
      fallback={
        <footer className="mt-auto border-t border-zinc-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-zinc-500">
            Loading…
          </div>
        </footer>
      }
    >
      <SitePortalFooter showPortalHub={false} />
    </Suspense>
  );
}
