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

  // Vendor management — storefront ops only (never dropship routes).
  const vendorLinks = [
    { href: "/vendor/products", label: t.vendorNav.product },
    { href: "/vendor/settings", label: t.vendorNav.store },
    { href: "/vendor/orders", label: t.vendorNav.orders },
    { href: "/vendor/tracking", label: t.vendorNav.tracking },
  ];

  const profileLinks = [
    { href: "/vendor/kyc", label: t.vendorNav.kycShort },
    { href: "/vendor/profile/email", label: t.vendorNav.email },
    { href: "/vendor/profile/phone", label: t.vendorNav.phone },
    { href: "/vendor/profile/address", label: t.vendorNav.address },
    { href: "/vendor/wallet", label: t.vendorNav.wallet },
  ];

  // Dropshipper management — CJ workspace only (never vendor store routes).
  const dropshipLinks = [
    { href: "/vendor/dropship/orders", label: t.vendorNav.dropshipOrders },
    { href: "/vendor/sourcing", label: t.vendorNav.catalog },
    {
      href: "/vendor/dropship/imported",
      label: t.vendorNav.importedProducts,
    },
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
          profileTitle={t.vendorNav.profileSection}
          dropshipTitle={t.vendorNav.dropshipSection}
          vendorLinks={vendorLinks}
          profileLinks={profileLinks}
          dropshipLinks={dropshipLinks}
          vendorHomeHref="/vendor/dashboard"
          dropshipHomeHref="/vendor/dropship"
          backLabel={t.vendorNav.backToStorefront}
        />
      </aside>
      <section className="min-w-0 flex-1 space-y-4">{children}</section>
    </div>
  );
}
