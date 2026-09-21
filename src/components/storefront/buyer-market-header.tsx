import Link from "next/link";
import { AuthHeaderButton } from "@/components/auth/auth-header-button";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { getDefaultBuyerAddress } from "@/lib/addresses/queries";
import { getSessionProfile } from "@/lib/auth/session";
import { countryLabelForCode } from "@/lib/sourcing/countries";
import { getBuyerSourcingContext } from "@/lib/sourcing/queries";

type BuyerMarketHeaderProps = {
  initialQuery?: string;
};

/**
 * Super-app header: brand + location/address + prominent search.
 */
export async function BuyerMarketHeader({
  initialQuery = "",
}: BuyerMarketHeaderProps) {
  const [session, sourcing] = await Promise.all([
    getSessionProfile(),
    getBuyerSourcingContext(),
  ]);

  let addressLine = `${sourcing.regionName} · ${countryLabelForCode(sourcing.countryCode)}`;
  let addressHint = sourcing.fromProfile
    ? "Delivering to your saved region"
    : "Set an address for accurate delivery";

  if (session?.userId) {
    const defaultAddress = await getDefaultBuyerAddress(session.userId);
    if (defaultAddress) {
      const city = defaultAddress.city?.trim();
      const label = defaultAddress.label?.trim();
      addressLine = [
        label || defaultAddress.full_name,
        city,
        countryLabelForCode(defaultAddress.country_code),
      ]
        .filter(Boolean)
        .join(" · ");
      addressHint = defaultAddress.is_default
        ? "Default delivery address"
        : "Delivery address";
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--market-line)] bg-[var(--market-surface)]/95 backdrop-blur-md">
      <div className="mx-auto max-w-6xl space-y-2.5 px-4 pb-3 pt-3">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/"
            className="font-display text-xl font-medium tracking-tight text-[var(--market-ink)] sm:text-2xl"
          >
            Eisy Marketplace
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <LanguageSwitcher compact />
            {session ? (
              <SignOutButton />
            ) : (
              <AuthHeaderButton label="Sign in" />
            )}
          </div>
        </div>

        <Link
          href={session ? "/profile" : "/login?next=/profile"}
          className="group flex items-start gap-2 rounded-xl bg-[var(--background)] px-3 py-2 transition hover:bg-[#ebe6dc]"
        >
          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--market-accent-soft)] text-[var(--market-accent)]">
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11Z"
              />
              <circle cx="12" cy="10" r="2.2" />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--market-accent)]">
              Deliver to
            </span>
            <span className="block truncate text-sm font-semibold text-[var(--market-ink)] group-hover:underline">
              {addressLine}
            </span>
            <span className="block truncate text-xs text-[var(--market-muted)]">
              {addressHint}
            </span>
          </span>
          <span className="mt-2 text-sm text-[var(--market-muted)]" aria-hidden>
            ›
          </span>
        </Link>

        <form action="/products" method="get" className="relative">
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
            placeholder="Search products, brands, and stores"
            className="h-12 w-full rounded-2xl border border-[var(--market-line)] bg-white py-2 pl-10 pr-4 text-sm text-[var(--market-ink)] shadow-[0_1px_0_rgba(20,18,16,0.04)] outline-none transition placeholder:text-[var(--market-muted)] focus:border-[var(--market-accent)] focus:ring-2 focus:ring-[var(--market-accent-soft)]"
          />
        </form>
      </div>
    </header>
  );
}
