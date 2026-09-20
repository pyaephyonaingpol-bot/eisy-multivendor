import Link from "next/link";
import { AuthHeaderButton } from "@/components/auth/auth-header-button";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { CartTrigger } from "@/components/storefront/cart-trigger";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { AdminDashboardLink } from "@/components/layout/admin-dashboard-link";
import { getSessionProfile } from "@/lib/auth/session";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { getRequestLocale } from "@/lib/i18n/locale";

export async function StorefrontHeader() {
  const [session, locale] = await Promise.all([
    getSessionProfile(),
    getRequestLocale(),
  ]);
  const t = getDictionary(locale);

  const nav = [
    { href: "/", label: t.nav.home },
    { href: "/products", label: t.nav.shop },
    { href: "/vendors", label: t.nav.stores },
    { href: "/orders", label: t.nav.orders },
    { href: "/account/wallet", label: t.nav.wallet },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4 sm:h-16 sm:gap-4">
        <div className="flex min-w-0 items-center gap-4 sm:gap-8">
          <Link
            href="/"
            className="truncate text-base font-semibold tracking-tight sm:text-lg"
          >
            <span className="sm:hidden">{t.brand.short}</span>
            <span className="hidden sm:inline">{t.brand.full}</span>
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
            <AdminDashboardLink className="hover:text-zinc-950">
              {t.nav.adminDashboard}
            </AdminDashboardLink>
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-2 text-sm text-zinc-600 sm:gap-3">
          <LanguageSwitcher compact />
          <CartTrigger />
          {session ? (
            <div className="flex items-center gap-2 sm:gap-3">
              <span className="hidden max-w-[9rem] truncate text-zinc-500 lg:inline">
                {session.profile?.full_name ?? session.email}
              </span>
              <SignOutButton />
            </div>
          ) : (
            <AuthHeaderButton label={`${t.nav.signIn} / Sign Up`} />
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
        <AdminDashboardLink className="snap-start whitespace-nowrap rounded-full bg-zinc-50 px-3 py-1 hover:bg-zinc-100 hover:text-zinc-950">
          {t.nav.adminDashboard}
        </AdminDashboardLink>
      </nav>
    </header>
  );
}
