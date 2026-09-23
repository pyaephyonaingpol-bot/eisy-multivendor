import Link from "next/link";
import { AuthHeaderButton } from "@/components/auth/auth-header-button";
import { AccountMenuDropdown } from "@/components/layout/account-menu-dropdown";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { getDefaultBuyerAddress } from "@/lib/addresses/queries";
import { getSessionProfile } from "@/lib/auth/session";
import { countryLabelForCode } from "@/lib/sourcing/countries";
import { getBuyerSourcingContext } from "@/lib/sourcing/queries";

type BuyerMarketHeaderProps = {
  initialQuery?: string;
};

/**
 * Clean buyer super-app header: brand, deliver-to, search, Account menu.
 */
export async function BuyerMarketHeader({
  initialQuery = "",
}: BuyerMarketHeaderProps) {
  const [session, sourcing] = await Promise.all([
    getSessionProfile(),
    getBuyerSourcingContext(),
  ]);

  let addressLine = `${sourcing.regionName} · ${countryLabelForCode(sourcing.countryCode)}`;

  if (session?.userId) {
    const defaultAddress = await getDefaultBuyerAddress(session.userId);
    if (defaultAddress) {
      const city = defaultAddress.city?.trim();
      addressLine = [city, countryLabelForCode(defaultAddress.country_code)]
        .filter(Boolean)
        .join(" · ");
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--market-line)] bg-[var(--market-surface)]/95 backdrop-blur-md">
      <div className="mx-auto max-w-6xl space-y-2.5 px-4 pb-3 pt-3">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0 flex-1 overflow-hidden">
            <Link
              href="/"
              className="font-display block truncate text-xl font-medium tracking-tight text-[var(--market-ink)] sm:text-2xl"
            >
              Eisy
            </Link>
            <Link
              href={session ? "/profile" : "/login?next=/profile"}
              className="mt-0.5 block break-words text-xs leading-snug text-[var(--market-muted)] hover:text-[var(--market-ink)]"
            >
              Deliver to {addressLine}
            </Link>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <LanguageSwitcher compact />
            {session ? (
              <AccountMenuDropdown label="Account" />
            ) : (
              <AuthHeaderButton label="Sign in" />
            )}
          </div>
        </div>

        <form action="/products" method="get" className="relative w-full min-w-0">
          <label htmlFor="market-search" className="sr-only">
            Search products
          </label>
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[var(--market-muted)]">
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden
            >
              <circle cx="11" cy="11" r="6.5" />
              <path strokeLinecap="round" d="m16.5 16.5 3.5 3.5" />
            </svg>
          </span>
          <input
            id="market-search"
            name="q"
            type="search"
            defaultValue={initialQuery}
            placeholder="Search products and stores"
            className="h-11 w-full max-w-full rounded-2xl border border-[var(--market-line)] bg-white py-2 pl-10 pr-4 text-base text-[var(--market-ink)] outline-none transition placeholder:text-[var(--market-muted)] focus:border-[var(--market-accent)] focus:ring-2 focus:ring-[var(--market-accent-soft)]"
          />
        </form>
      </div>
    </header>
  );
}
