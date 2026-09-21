"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { PortalNavHub } from "@/components/layout/portal-nav-hub";

function resolveActive(
  pathname: string,
  searchPortal: string | null,
): "buyer" | "vendor" | "cj" | "admin" | undefined {
  if (pathname.startsWith("/admin")) return "admin";
  if (
    pathname.startsWith("/vendor/dropship") ||
    pathname.startsWith("/vendor/sourcing") ||
    pathname.startsWith("/vendor/import") ||
    pathname.startsWith("/vendor/integrations") ||
    pathname.startsWith("/vendor/fees") ||
    searchPortal === "cj"
  ) {
    return "cj";
  }
  if (pathname.startsWith("/vendor")) return "vendor";
  // Storefront + auth share the buyer marketplace as home.
  if (
    pathname === "/" ||
    pathname.startsWith("/products") ||
    pathname.startsWith("/vendors") ||
    pathname.startsWith("/cart") ||
    pathname.startsWith("/orders") ||
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/account") ||
    pathname.startsWith("/profile") ||
    pathname.startsWith("/store") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/register")
  ) {
    return "buyer";
  }
  return undefined;
}

type SitePortalFooterProps = {
  /** Optional brand blurb shown above the portal hub. */
  brandTitle?: string;
  brandDescription?: string;
  shopLinks?: boolean;
  /**
   * Show the Portals card grid (Buyer / Vendor / CJ / Admin).
   * Off by default on the buyer storefront — use the Account menu instead.
   */
  showPortalHub?: boolean;
};

/**
 * Shared site footer: brand + shop shortcuts (+ optional portal hub).
 * Buyer storefront keeps this clean; seller/admin can still show portal cards.
 */
export function SitePortalFooter({
  brandTitle = "Eisy Marketplace",
  brandDescription = "Browse products, pay with USDT, and checkout in a clean buyer storefront.",
  shopLinks = true,
  showPortalHub = true,
}: SitePortalFooterProps) {
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();
  const active = resolveActive(pathname, searchParams.get("portal"));
  const onAccountSurface =
    pathname.startsWith("/profile") || pathname.startsWith("/account");

  return (
    <footer className="mt-auto border-t border-zinc-200 bg-white">
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-10">
        <div
          className={`grid gap-8 ${shopLinks ? "sm:grid-cols-2" : ""}`}
        >
          <div className="space-y-2">
            <p className="text-sm font-semibold text-zinc-950">{brandTitle}</p>
            <p className="text-sm text-zinc-500">{brandDescription}</p>
          </div>
          {shopLinks ? (
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
                <Link href="/orders" className="hover:text-zinc-950">
                  Orders
                </Link>
                <Link href="/account/wallet" className="hover:text-zinc-950">
                  Wallet
                </Link>
                <Link href="/profile" className="hover:text-zinc-950">
                  Profile
                </Link>
              </div>
            </div>
          ) : null}
        </div>

        {onAccountSurface ? null : showPortalHub ? (
          <PortalNavHub active={active} />
        ) : null}
      </div>
      <div className="border-t border-zinc-100">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 text-xs text-zinc-500">
          <p>© 2026 Eisy Marketplace · Checkout in USDT</p>
          <p>
            Default home:{" "}
            <Link href="/" className="font-medium text-zinc-700 hover:text-zinc-950">
              Buyer Marketplace
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
