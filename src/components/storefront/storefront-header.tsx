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
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            EISY Marketplace
          </Link>
          <nav className="hidden items-center gap-5 text-sm text-zinc-600 md:flex">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} className="hover:text-zinc-950">
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3 text-sm text-zinc-600">
          <RegionSelector
            countryCode={sourcing.countryCode}
            regionCode={sourcing.regionCode}
            regionName={sourcing.regionName}
          />
          <CartTrigger />
          {session ? (
            <div className="flex items-center gap-3">
              <span className="hidden max-w-[9rem] truncate text-zinc-500 lg:inline">
                {session.profile?.full_name ?? session.email}
              </span>
              <SignOutButton />
            </div>
          ) : (
            <Link
              href="/login"
              className="rounded-full bg-zinc-950 px-4 py-1.5 text-white hover:bg-zinc-800"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
      <nav className="flex gap-4 overflow-x-auto border-t border-zinc-100 px-4 py-2 text-sm text-zinc-600 md:hidden">
        {nav.map((item) => (
          <Link key={item.href} href={item.href} className="whitespace-nowrap hover:text-zinc-950">
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
