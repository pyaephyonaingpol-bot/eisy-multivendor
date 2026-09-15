import Link from "next/link";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { getRequestLocale } from "@/lib/i18n/locale";

export default async function VendorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getRequestLocale();
  const t = getDictionary(locale);
  const links = [
    { href: "/vendor/dashboard", label: t.vendorNav.overview },
    { href: "/vendor/settings", label: t.vendorNav.storeBranding },
    { href: "/vendor/apply", label: t.vendorNav.application },
    { href: "/vendor/products", label: t.vendorNav.products },
    { href: "/vendor/sourcing", label: t.vendorNav.sourcing },
    { href: "/vendor/import", label: t.vendorNav.import },
    { href: "/vendor/integrations", label: t.vendorNav.integrations },
    { href: "/vendor/fees", label: t.vendorNav.fees },
    { href: "/vendor/wallet", label: t.vendorNav.wallet },
    { href: "/vendor/orders", label: t.vendorNav.orders },
  ];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-6 md:flex-row md:gap-8 md:py-8">
      <aside className="w-full shrink-0 space-y-3 md:w-52 md:space-y-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">{t.vendorNav.title}</p>
          <LanguageSwitcher compact />
        </div>
        <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 text-sm text-zinc-600 [scrollbar-width:none] md:flex-col md:gap-2 md:overflow-visible md:pb-0 [&::-webkit-scrollbar]:hidden">
          {links.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded-full border border-zinc-200 bg-white px-3 py-1.5 hover:border-zinc-300 hover:text-zinc-950 md:rounded-none md:border-0 md:bg-transparent md:px-0 md:py-0"
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="/"
            className="whitespace-nowrap rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-zinc-400 hover:text-zinc-950 md:rounded-none md:border-0 md:bg-transparent md:px-0 md:pb-0 md:pt-4"
          >
            {t.vendorNav.backToStorefront}
          </Link>
        </nav>
      </aside>
      <section className="min-w-0 flex-1">{children}</section>
    </div>
  );
}
