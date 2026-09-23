import Link from "next/link";
import { redirect } from "next/navigation";
import { ImportQuotaBanner } from "@/components/import-limits/import-quota-banner";
import { ImportToMyStoreForm } from "@/components/storefront/import-to-my-store-form";
import { getSessionProfile, canAccessVendor } from "@/lib/auth/session";
import { listImportableCatalogProducts } from "@/lib/dropship/queries";
import { getVendorImportQuota } from "@/lib/import-limits/queries";
import { formatMoney, MARKETPLACE_CURRENCY } from "@/lib/money";
import { getVendorForOwner } from "@/lib/vendors/queries";

export const dynamic = "force-dynamic";

/**
 * Reseller import of independent / marketplace vendor products.
 * Kept separate from CJ Dropshipping bulk import (/vendor/import).
 */
export default async function VendorMarketplaceImportPage() {
  const session = await getSessionProfile();

  if (!session) {
    redirect("/login?next=/vendor/import/marketplace");
  }

  if (!canAccessVendor(session.role)) {
    redirect("/");
  }

  const vendor = await getVendorForOwner(session.userId);

  if (!vendor) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          Marketplace reseller import
        </h1>
        <p className="text-zinc-600">
          Submit a vendor application before you can resell marketplace listings.
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
        <h1 className="text-2xl font-semibold tracking-tight">
          Marketplace reseller import
        </h1>
        <p className="text-zinc-600">
          Your store must be approved before you can import marketplace products.
        </p>
        <Link href="/vendor/apply" className="text-sm font-medium underline">
          Check application status
        </Link>
      </div>
    );
  }

  const [catalog, quota] = await Promise.all([
    listImportableCatalogProducts(vendor.id, 60),
    getVendorImportQuota(vendor.id),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Independent Vendor marketplace
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Marketplace reseller import
          </h1>
          <p className="max-w-2xl text-zinc-600">
            Copy active listings from other independent vendors into{" "}
            <strong>{vendor.name}</strong>. This is not the CJ Dropshipping
            catalog — CJ bulk import lives on a separate page.
          </p>
          <p className="text-sm text-zinc-500">
            <Link href="/vendor/import" className="font-medium underline">
              ← Bulk import from CJ
            </Link>
          </p>
        </div>
      </div>

      {quota ? <ImportQuotaBanner quota={quota} /> : null}

      <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm text-amber-950">
        <p className="font-semibold">Not CJ Dropshipping</p>
        <p className="mt-1 text-amber-900/80">
          These products come from other marketplace vendors. For CJ supplier
          bulk import (color/size matrix, CJ fulfillment), use{" "}
          <Link href="/vendor/import" className="font-medium underline">
            Bulk import from CJ
          </Link>
          .
        </p>
      </div>

      {catalog.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center">
          <p className="text-zinc-700">
            No independent vendor products available to resell yet.
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            CJ-imported listings are excluded from this list by design.
          </p>
          <Link
            href="/vendor/import"
            className="mt-4 inline-flex rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800"
          >
            Open CJ bulk import
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
                      Vendor{" "}
                      <Link
                        href={`/vendors/${product.vendor.slug}`}
                        className="underline"
                      >
                        {product.vendor.name}
                      </Link>
                      {" · "}
                      <Link
                        href={`/products/${product.id}`}
                        className="underline"
                      >
                        View product
                      </Link>
                    </p>
                    <p className="text-sm text-zinc-700">
                      Catalog{" "}
                      <strong>
                        {formatMoney(
                          Number(product.price),
                          MARKETPLACE_CURRENCY,
                        )}
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
                  disabled={quota?.at_import_limit ?? false}
                  disabledReason={
                    quota?.at_import_limit
                      ? `Import limit reached (${quota.catalog_item_count}/${quota.max_import_items}). Archive listings or upgrade your plan.`
                      : undefined
                  }
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
