import Link from "next/link";

export function StorefrontFooter() {
  return (
    <footer className="mt-auto border-t border-zinc-200 bg-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-zinc-950">EISY Marketplace</p>
          <p className="text-sm text-zinc-500">
            Browse products, pay with USDT, and checkout in a clean buyer storefront.
          </p>
        </div>
        <div className="space-y-2 text-sm sm:justify-self-end">
          <p className="font-medium text-zinc-950">Shop</p>
          <div className="flex flex-col gap-1 text-zinc-600 sm:items-end">
            <Link href="/products" className="hover:text-zinc-950">
              All products
            </Link>
            <Link href="/vendors" className="hover:text-zinc-950">
              Stores
            </Link>
            <Link href="/cart" className="hover:text-zinc-950">
              Cart
            </Link>
            <Link href="/account/wallet" className="hover:text-zinc-950">
              Wallet
            </Link>
          </div>
        </div>
      </div>
      <div className="border-t border-zinc-100">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 text-xs text-zinc-500">
          <p>© 2026 EISY Marketplace · Checkout in USDT</p>
          <Link
            href="/vendor/dashboard"
            className="text-zinc-400 transition hover:text-zinc-600"
          >
            Vendor &amp; Dropshipper Portal
          </Link>
        </div>
      </div>
    </footer>
  );
}
