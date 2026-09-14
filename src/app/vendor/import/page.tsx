import Link from "next/link";
import { redirect } from "next/navigation";
import { ImportToMyStoreForm } from "@/components/storefront/import-to-my-store-form";
import { getSessionProfile, canAccessVendor } from "@/lib/auth/session";
import { listImportableCatalogProducts } from "@/lib/dropship/queries";
import { formatMoney, MARKETPLACE_CURRENCY } from "@/lib/money";
import { getVendorForOwner } from "@/lib/vendors/queries";

export const dynamic = "force-dynamic";

export default async function VendorImportPage() {
  const session = await getSessionProfile();

  if (!session) {
    redirect("/login?next=/vendor/import");
  }

  if (!canAccessVendor(session.role)) {
    redirect("/");
  }

  const vendor = await getVendorForOwner(session.userId);

  if (!vendor) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Import products</h1>
        <p className="text-zinc-600">
          Submit a vendor application before you can import dropship catalog items.
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

  if (vendor.status !== "approved") {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Import products</h1>
        <p className="text-zinc-600">
          Your store must be approved before you can import supplier products.
        </p>
        <Link href="/vendor/apply" className="text-sm font-medium underline">
          Check application status
        </Link>
      </div>
    );
  }

  const catalog = await listImportableCatalogProducts(vendor.id, 60);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Import to My Store</h1>
          <p className="max-w-2xl text-zinc-600">
            Browse the marketplace supplier catalog, set your selling price, and
            add products to <strong>{vendor.name}</strong>. When customers buy from
            you, orders and stock automatically route to the original vendor.
          </p>
        </div>
        <Link
          href="/vendor/import/extension"
          className="inline-flex rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
        >
          Browser extension API
        </Link>
      </div>

      {catalog.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center">
          <p className="text-zinc-700">No importable supplier products yet.</p>
          <p className="mt-1 text-sm text-zinc-500">
            Once other approved vendors publish active products, they will appear here.
          </p>
          <Link
            href="/products"
            className="mt-4 inline-flex rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Browse storefront
          </Link>
        </div>
      ) : (
        <ul className="space-y-4">
          {catalog.map((product) => {
            const thumbnail = product.images?.[0];
            const suggested =
              Math.round(Number(product.price) * 1.15 * 100) / 100;
            return (
              <li
                key={product.id}
                className="grid gap-4 rounded-xl border border-zinc-200 bg-white p-4 lg:grid-cols-[1fr_minmax(240px,280px)]"
              >
                <div className="flex min-w-0 gap-3">
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50">
                    {thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumbnail}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[10px] uppercase tracking-wide text-zinc-400">
                        No img
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium text-zinc-950">{product.name}</p>
                    <p className="text-sm text-zinc-500">
                      Supplier{" "}
                      <Link
                        href={`/vendors/${product.vendor.slug}`}
                        className="underline"
                      >
                        {product.vendor.name}
                      </Link>
                      {" · "}
                      <Link href={`/products/${product.id}`} className="underline">
                        View product
                      </Link>
                    </p>
                    <p className="text-sm text-zinc-700">
                      Catalog{" "}
                      <strong>
                        {formatMoney(Number(product.price), MARKETPLACE_CURRENCY)}
                      </strong>
                      {product.product_type === "physical"
                        ? ` · ${product.stock_quantity} supplier stock`
                        : " · Digital"}
                    </p>
                  </div>
                </div>
                <ImportToMyStoreForm
                  sourceProductId={product.id}
                  defaultPrice={suggested}
                  suggestedMinPrice={Number(product.price)}
                  compact
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
