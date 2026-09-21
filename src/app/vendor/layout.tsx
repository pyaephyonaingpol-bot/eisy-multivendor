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

  // Independent Vendor Portal — custom sources only (zero CJ overlap).
  const vendorLinks = [
    { href: "/vendor/products", label: t.vendorNav.products },
    { href: "/vendor/settings", label: t.vendorNav.store },
    { href: "/vendor/orders", label: t.vendorNav.orders },
    { href: "/vendor/tracking", label: t.vendorNav.tracking },
    { href: "/vendor/disputes", label: t.vendorNav.disputes },
    { href: "/vendor/wallet", label: t.vendorNav.wallet },
  ];

  // CJ Dropshipping Portal — CJ workflow only (zero vendor product overlap).
  const dropshipLinks = [
    { href: "/vendor/sourcing", label: t.vendorNav.catalog },
    {
      href: "/vendor/dropship/imported",
      label: t.vendorNav.importedProducts,
    },
    { href: "/vendor/dropship/orders", label: t.vendorNav.cjOrders },
    { href: "/vendor/dropship/tracking", label: t.vendorNav.cjTracking },
    { href: "/vendor/dropship/disputes", label: t.vendorNav.cjDisputes },
    { href: "/vendor/fees", label: t.vendorNav.fees },
    { href: "/vendor/wallet", label: t.vendorNav.wallet },
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
          vendorTitle={t.vendorNav.vendorSection}
          dropshipTitle={t.vendorNav.dropshipSection}
          vendorLinks={vendorLinks}
          dropshipLinks={dropshipLinks}
          vendorHomeHref="/vendor/dashboard"
          dropshipHomeHref="/vendor/dropship"
          accountHref="/vendor/profile"
          accountLabel={t.vendorNav.profile}
          walletHref="/vendor/wallet"
          walletLabel={t.vendorNav.wallet}
          backLabel={t.vendorNav.backToStorefront}
        />
      </aside>
      <section className="min-w-0 flex-1 space-y-4">{children}</section>
    </div>
  );
}
