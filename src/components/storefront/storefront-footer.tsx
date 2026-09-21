import { Suspense } from "react";
import { SitePortalFooter } from "@/components/layout/site-portal-footer";

/**
 * Buyer storefront footer with shop links and portal navigation hub.
 * Suspense wraps the client footer (uses searchParams for active portal).
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
      <SitePortalFooter />
    </Suspense>
  );
}
