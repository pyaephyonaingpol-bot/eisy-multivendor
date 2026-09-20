import Link from "next/link";
import { redirect } from "next/navigation";
import { canAccessVendor, getSessionProfile } from "@/lib/auth/session";
import { getVendorForOwner } from "@/lib/vendors/queries";

export const dynamic = "force-dynamic";

/**
 * Dropshipping workspace hub — supplier catalog sourcing is kept separate
 * from day-to-day store operations (products, orders, wallet).
 */
export default async function VendorDropshipHubPage() {
  const session = await getSessionProfile();
  if (!session) {
    redirect("/login?next=/vendor/dropship");
  }
  if (!canAccessVendor(session.role)) {
    redirect("/");
  }

  const vendor = await getVendorForOwner(session.userId);
  if (!vendor) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          Dropshipping workspace
        </h1>
        <p className="text-zinc-600">
          Apply as a vendor first, then use this workspace to source and import
          products from the platform supplier catalog.
        </p>
        <Link
          href="/vendor/apply"
          className="inline-flex rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Apply as a vendor
        </Link>
      </div>
    );
  }

  const cards = [
    {
      href: "/vendor/sourcing",
      title: "Product sourcing",
      body: "Search the CJ Dropshipping catalog, preview items, and one-click import into your store.",
    },
    {
      href: "/vendor/import",
      title: "Import tools",
      body: "Review import quotas, extension helpers, and bulk dropship listing workflows.",
    },
    {
      href: "/vendor/integrations",
      title: "Supplier catalog",
      body: "Browse platform-managed supplier panels and import with preview.",
    },
    {
      href: "/vendor/fees",
      title: "Dropship fees",
      body: "Track inventory fees and dropship commissions for sourced listings.",
    },
  ] as const;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-sky-800">
          Dropshipping workspace
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">
          Source & import products
        </h1>
        <p className="max-w-2xl text-sm text-zinc-600">
          This area is for platform supplier catalogs and dropship imports. Store
          branding, orders, wallet, and profile stay under{" "}
          <Link href="/vendor/dashboard" className="font-medium underline">
            My Store
          </Link>
          .
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50/90 to-white p-5 transition hover:border-sky-300 hover:shadow-sm"
          >
            <h2 className="text-base font-semibold text-sky-950 group-hover:underline">
              {card.title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-sky-950/75">
              {card.body}
            </p>
          </Link>
        ))}
      </div>

      <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
        Imported listings appear in{" "}
        <Link href="/vendor/products" className="font-medium underline">
          My Store → Products
        </Link>{" "}
        for pricing, inventory, and storefront publishing.
      </div>
    </div>
  );
}
