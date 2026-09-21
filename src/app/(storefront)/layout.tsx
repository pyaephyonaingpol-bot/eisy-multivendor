import { CartDrawer } from "@/components/storefront/cart-drawer";
import { CartProvider } from "@/components/storefront/cart-provider";
import { StorefrontFooter } from "@/components/storefront/storefront-footer";
import { StorefrontHeader } from "@/components/storefront/storefront-header";

/**
 * Buyer storefront chrome — isolated from /vendor and /admin layouts.
 * Shares the same Supabase backend via app-level clients.
 */
export default function StorefrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CartProvider>
      <StorefrontHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-10">
        {children}
      </main>
      <StorefrontFooter />
      <CartDrawer />
    </CartProvider>
  );
}
