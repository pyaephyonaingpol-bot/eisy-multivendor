import Link from "next/link";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { getSessionProfile } from "@/lib/auth/session";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { getRequestLocale } from "@/lib/i18n/locale";

export async function Header() {
  const [session, locale] = await Promise.all([
    getSessionProfile(),
    getRequestLocale(),
  ]);
  const t = getDictionary(locale);
  const nav = [
    { href: "/products", label: t.nav.shop },
    { href: "/vendors", label: t.nav.stores },
    { href: "/cart", label: t.nav.cart },
    { href: "/orders", label: t.nav.orders },
    { href: "/account/wallet", label: t.nav.wallet },
  ];

  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:h-16">
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
          <LanguageSwitcher compact />
          {session ? (
            <div className="flex items-center gap-3">
              <span className="hidden max-w-[10rem] truncate text-zinc-500 sm:inline">
                {session.profile?.full_name ?? session.email}
              </span>
              <SignOutButton />
            </div>
          ) : (
            <Link
              href="/login"
              className="rounded-full bg-zinc-950 px-4 py-1.5 text-white hover:bg-zinc-800"
            >
              {t.nav.signIn}
            </Link>
          )}
        </nav>
        <div className="flex items-center gap-2 md:hidden">
          <LanguageSwitcher compact />
          {session ? (
            <SignOutButton />
          ) : (
            <Link
              href="/login"
              className="rounded-full bg-zinc-950 px-3 py-1.5 text-xs text-white hover:bg-zinc-800"
            >
              {t.nav.signIn}
            </Link>
          )}
        </div>
      </div>
      <nav className="flex gap-3 overflow-x-auto border-t border-zinc-100 px-4 py-2 text-sm text-zinc-600 [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden">
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="whitespace-nowrap rounded-full bg-zinc-50 px-3 py-1 hover:bg-zinc-100 hover:text-zinc-950"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

export async function Footer() {
  const locale = await getRequestLocale();
  const t = getDictionary(locale);
  return (
    <footer className="mt-auto border-t border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-zinc-500">
        <p>
          © 2026 {t.brand.full} · USDT
        </p>
        <Link
          href="/vendor/dashboard"
          className="text-xs text-zinc-400 transition hover:text-zinc-600"
        >
          {t.nav.vendorPortal}
        </Link>
      </div>
    </footer>
  );
}
