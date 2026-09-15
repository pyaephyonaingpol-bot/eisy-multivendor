import Link from "next/link";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { CartTrigger } from "@/components/storefront/cart-trigger";
import { RegionSelector } from "@/components/storefront/region-selector";
import { getSessionProfile } from "@/lib/auth/session";
import { getBuyerSourcingContext } from "@/lib/sourcing/queries";

const nav = [
  { href: "/", label: "Home" },
  { href: "/products", label: "Shop" },
  { href: "/vendors", label: "Stores" },
  { href: "/orders", label: "Orders" },
  { href: "/account/wallet", label: "Wallet" },
];

export async function StorefrontHeader() {
  const session = await getSessionProfile();
  const sourcing = await getBuyerSourcingContext(
    session?.profile?.preferred_country_code ?? null,
  );

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4 sm:h-16 sm:gap-4">
        <div className="flex min-w-0 items-center gap-4 sm:gap-8">
          <Link
            href="/"
            className="truncate text-base font-semibold tracking-tight sm:text-lg"
          >
            <span className="sm:hidden">EISY</span>
            <span className="hidden sm:inline">EISY Marketplace</span>
          </Link>
          <nav className="hidden items-center gap-5 text-sm text-zinc-600 md:flex">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="hover:text-zinc-950"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-2 text-sm text-zinc-600 sm:gap-3">
          <RegionSelector
            countryCode={sourcing.countryCode}
            regionCode={sourcing.regionCode}
            regionName={sourcing.regionName}
          />
          <CartTrigger />
          {session ? (
            <div className="flex items-center gap-2 sm:gap-3">
              <span className="hidden max-w-[9rem] truncate text-zinc-500 lg:inline">
                {session.profile?.full_name ?? session.email}
              </span>
              <SignOutButton />
            </div>
          ) : (
            <Link
              href="/login"
              className="rounded-full bg-zinc-950 px-3 py-1.5 text-xs text-white hover:bg-zinc-800 sm:px-4 sm:text-sm"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
      <nav className="flex gap-3 overflow-x-auto border-t border-zinc-100 px-4 py-2 text-sm text-zinc-600 [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden">
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="snap-start whitespace-nowrap rounded-full bg-zinc-50 px-3 py-1 hover:bg-zinc-100 hover:text-zinc-950"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
