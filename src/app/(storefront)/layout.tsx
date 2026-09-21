import { BuyerBottomNav } from "@/components/storefront/buyer-bottom-nav";
import { BuyerMarketHeader } from "@/components/storefront/buyer-market-header";
import { CartDrawer } from "@/components/storefront/cart-drawer";
import { CartProvider } from "@/components/storefront/cart-provider";
import { StorefrontFooter } from "@/components/storefront/storefront-footer";

/**
 * Buyer storefront chrome — Noon-style super-app shell:
 * location/search header + page content + portal footer + fixed bottom tabs.
 */
export default function StorefrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CartProvider>
      <BuyerMarketHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-4 sm:pb-28 sm:pt-5">
        {children}
      </main>
      <div className="pb-20 sm:pb-24">
        <StorefrontFooter />
      </div>
      <BuyerBottomNav />
      <CartDrawer />
    </CartProvider>
  );
}
