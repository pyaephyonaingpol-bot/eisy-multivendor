import { Suspense } from "react";
import { BuyerBottomNav } from "@/components/storefront/buyer-bottom-nav";
import { BuyerMarketHeader } from "@/components/storefront/buyer-market-header";
import { CartDrawer } from "@/components/storefront/cart-drawer";
import { CartProvider } from "@/components/storefront/cart-provider";
import { StorefrontFooter } from "@/components/storefront/storefront-footer";

/**
 * Buyer shell — sticky header, full-width workspace, bottom tabs.
 */
export default function StorefrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CartProvider>
      <BuyerMarketHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-4 sm:pt-5">
        {children}
      </main>
      <div className="pb-20 sm:pb-24">
        <StorefrontFooter />
      </div>
      <Suspense fallback={null}>
        <BuyerBottomNav />
      </Suspense>
      <CartDrawer />
    </CartProvider>
  );
}
