import Link from "next/link";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { VendorPortalNav } from "@/components/vendors/vendor-portal-nav";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { getRequestLocale } from "@/lib/i18n/locale";

export default async function VendorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getRequestLocale();
  const t = getDictionary(locale);

  const storeLinks = [
    { href: "/vendor/dashboard", label: t.vendorNav.overview },
    { href: "/vendor/profile", label: t.vendorNav.profile },
    { href: "/vendor/kyc", label: t.vendorNav.kyc },
    { href: "/vendor/settings", label: t.vendorNav.storeBranding },
    { href: "/vendor/products", label: t.vendorNav.products },
    { href: "/vendor/orders", label: t.vendorNav.orders },
    { href: "/vendor/wallet", label: t.vendorNav.wallet },
    { href: "/vendor/apply", label: t.vendorNav.application },
  ];

  const dropshipLinks = [
    { href: "/vendor/dropship", label: t.vendorNav.dropshipHub },
    { href: "/vendor/sourcing", label: t.vendorNav.sourcing },
    { href: "/vendor/import", label: t.vendorNav.import },
    { href: "/vendor/integrations", label: t.vendorNav.integrations },
    { href: "/vendor/fees", label: t.vendorNav.fees },
  ];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-6 md:flex-row md:gap-8 md:py-8">
      <aside className="w-full shrink-0 space-y-3 md:w-56 md:space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-zinc-950">
              {t.vendorNav.title}
            </p>
            <p className="text-xs text-zinc-500">{t.vendorNav.subtitle}</p>
          </div>
          <LanguageSwitcher compact />
        </div>
        <VendorPortalNav
          storeTitle={t.vendorNav.storeSection}
          dropshipTitle={t.vendorNav.dropshipSection}
          storeLinks={storeLinks}
          dropshipLinks={dropshipLinks}
          backLabel={t.vendorNav.backToStorefront}
        />
      </aside>
      <section className="min-w-0 flex-1 space-y-4">
        <div className="flex flex-wrap gap-2 text-xs md:hidden">
          <Link
            href="/vendor/dashboard"
            className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-zinc-700"
          >
            {t.vendorNav.storeSection}
          </Link>
          <Link
            href="/vendor/dropship"
            className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-sky-900"
          >
            {t.vendorNav.dropshipSection}
          </Link>
        </div>
        {children}
      </section>
    </div>
  );
}
