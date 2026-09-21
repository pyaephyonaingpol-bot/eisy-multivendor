import Link from "next/link";
import { redirect } from "next/navigation";
import { canAccessVendor, getSessionProfile } from "@/lib/auth/session";
import { getVendorForOwner } from "@/lib/vendors/queries";

export const dynamic = "force-dynamic";

/**
 * Dropshipper workspace hub — Orders, Catalog, and Imported products.
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
        <h1 className="text-2xl font-semibold tracking-tight">Dropshipper</h1>
        <p className="text-zinc-600">
          Apply as a vendor first, then use this section to source catalog items
          and track dropship orders.
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
      href: "/vendor/dropship/orders",
      title: "Orders",
      body: "Sales from your store that route fulfillment to a supplier.",
    },
    {
      href: "/vendor/sourcing",
      title: "CJ catalog",
      body: "Browse CJ Dropshipping and import listings into the CJ product list.",
    },
    {
      href: "/vendor/dropship/imported",
      title: "CJ products",
      body: "Manage only CJ Dropshipping imports — kept separate from manual Vendor → Products.",
    },
  ] as const;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-sky-800">
          Dropshipper
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">
          Dropshipper workspace
        </h1>
        <p className="max-w-2xl text-sm text-zinc-600">
          Dedicated sourcing and import tools. Day-to-day store ops (Product,
          Store, Orders, Tracking) live under Vendor. Profile details sit under
          Profile & settings.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
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
        Need fees or integrations?{" "}
        <Link href="/vendor/fees" className="font-medium underline">
          Dropship fees
        </Link>
        {" · "}
        <Link href="/vendor/integrations" className="font-medium underline">
          Supplier panels
        </Link>
        {" · "}
        <Link href="/vendor/import" className="font-medium underline">
          Import tools
        </Link>
      </div>
    </div>
  );
}
