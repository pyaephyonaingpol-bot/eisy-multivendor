import Link from "next/link";

export function StorefrontFooter() {
  return (
    <footer className="mt-auto border-t border-zinc-200 bg-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-zinc-950">EISY Marketplace</p>
          <p className="text-sm text-zinc-500">
            Shop independent vendors with USDT checkout. Vendor and admin tools stay on
            separate portals.
          </p>
        </div>
        <div className="space-y-2 text-sm">
          <p className="font-medium text-zinc-950">Shop</p>
          <div className="flex flex-col gap-1 text-zinc-600">
            <Link href="/products" className="hover:text-zinc-950">
              All products
            </Link>
            <Link href="/vendors" className="hover:text-zinc-950">
              Vendors
            </Link>
            <Link href="/cart" className="hover:text-zinc-950">
              Cart
            </Link>
            <Link href="/account/wallet" className="hover:text-zinc-950">
              Wallet
            </Link>
          </div>
        </div>
        <div className="space-y-2 text-sm">
          <p className="font-medium text-zinc-950">Sellers</p>
          <div className="flex flex-col gap-1 text-zinc-600">
            <Link href="/vendor/apply" className="hover:text-zinc-950">
              Become a vendor
            </Link>
            <Link href="/vendor/dashboard" className="hover:text-zinc-950">
              Vendor dashboard
            </Link>
          </div>
        </div>
      </div>
      <div className="border-t border-zinc-100">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 text-xs text-zinc-500">
          <p>© 2026 EISY Marketplace</p>
          <p>Checkout in USDT · MMK withdrawals for vendors</p>
        </div>
      </div>
    </footer>
  );
}
