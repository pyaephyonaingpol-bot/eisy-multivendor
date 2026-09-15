import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionProfile, canAccessVendor } from "@/lib/auth/session";
import { listProductsForVendor } from "@/lib/products/queries";
import { getVendorForOwner } from "@/lib/vendors/queries";

export const dynamic = "force-dynamic";

export default async function VendorSourcingIndexPage() {
  const session = await getSessionProfile();

  if (!session) {
    redirect("/login?next=/vendor/sourcing");
  }

  if (!canAccessVendor(session.role)) {
    redirect("/");
  }

  const vendor = await getVendorForOwner(session.userId);

  if (!vendor) {
    redirect("/vendor/apply");
  }

  const products = await listProductsForVendor(vendor.id);
  const sourceProducts = products.filter((product) => !product.is_dropship);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Regional sourcing</h1>
        <p className="max-w-2xl text-zinc-600">
          Configure CJ Dropshipping, DSers, Print-on-Demand, and internal warehouse
          routes per buyer region. Dropship listings inherit routes from their source
          catalog products. USDT checkout and MMK/USDT wallet rules stay unchanged.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-950">
        <div>
          <p className="font-semibold text-emerald-900">One-click Import to Store</p>
          <p className="mt-0.5 text-emerald-900/90">
            Search CJ Dropshipping or DSers and import supplier items into your
            active inventory in one click (min 10 active / max plan limit enforced).
          </p>
        </div>
        <Link
          href="/vendor/integrations"
          className="inline-flex shrink-0 rounded-lg bg-emerald-800 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          Open CJ / DSers catalog
        </Link>
      </div>

      {sourceProducts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center text-sm text-zinc-600">
          No source catalog products yet. Add a product, then attach regional supplier
          routes.
        </div>
      ) : (
        <ul className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white">
          {sourceProducts.map((product) => (
            <li
              key={product.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
            >
              <div>
                <p className="font-medium text-zinc-950">{product.name}</p>
                <p className="text-zinc-500">
                  {product.product_type} · {product.status}
                </p>
              </div>
              <Link
                href={`/vendor/sourcing/${product.id}`}
                className="font-medium text-zinc-950 underline"
              >
                Manage routes
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
