import { Suspense } from "react";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { SitePortalFooter } from "@/components/layout/site-portal-footer";
import { VendorBottomNav } from "@/components/vendors/vendor-bottom-nav";
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

  // Independent Vendor — custom-source ops only (no CJ links).
  const vendorLinks = [
    { href: "/vendor/products", label: t.vendorNav.products },
    { href: "/vendor/settings", label: t.vendorNav.store },
    { href: "/vendor/orders", label: t.vendorNav.orders },
    { href: "/vendor/tracking", label: t.vendorNav.tracking },
    { href: "/vendor/disputes", label: t.vendorNav.disputes },
    { href: "/vendor/wallet?portal=vendor", label: t.vendorNav.wallet },
  ];

  // CJ Dropshipping — CJ workflow + fees + wallet (no Independent Vendor links).
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
    { href: "/vendor/wallet?portal=cj", label: t.vendorNav.wallet },
  ];

  return (
    <>
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-6 pb-24 md:flex-row md:gap-8 md:py-8 md:pb-28">
        <aside className="hidden w-full shrink-0 space-y-3 md:block md:w-56 md:space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-zinc-950">
                {t.vendorNav.title}
              </p>
              <p className="text-xs text-zinc-500">
                One portal at a time — menus never mix
              </p>
            </div>
            <LanguageSwitcher compact />
          </div>
          <Suspense
            fallback={
              <div className="h-40 animate-pulse rounded-xl bg-zinc-100" />
            }
          >
            <VendorPortalNav
              vendorTitle={t.vendorNav.vendorSection}
              dropshipTitle={t.vendorNav.dropshipSection}
              vendorLinks={vendorLinks}
              dropshipLinks={dropshipLinks}
              vendorHomeHref="/vendor/dashboard"
              dropshipHomeHref="/vendor/dropship"
              accountHref="/vendor/profile"
              accountLabel={t.vendorNav.profile}
              backLabel={t.vendorNav.backToStorefront}
            />
          </Suspense>
        </aside>
        <div className="flex items-center justify-between gap-2 md:hidden">
          <div>
            <p className="text-sm font-semibold text-zinc-950">
              {t.vendorNav.title}
            </p>
            <p className="text-xs text-zinc-500">Quick actions below</p>
          </div>
          <LanguageSwitcher compact />
        </div>
        <section className="min-w-0 flex-1 space-y-4">{children}</section>
      </div>
      <div className="pb-20 sm:pb-24">
        <Suspense fallback={null}>
          <SitePortalFooter
            brandTitle="EISY Seller"
            brandDescription="Switch portals anytime — buyer shop, independent vendor, CJ dropshipping, or admin."
            shopLinks={false}
          />
        </Suspense>
      </div>
      <Suspense fallback={null}>
        <VendorBottomNav />
      </Suspense>
    </>
  );
}
