import Link from "next/link";
import { redirect } from "next/navigation";
import { UnifiedSupplierSourcingCatalog } from "@/components/suppliers/unified-supplier-sourcing-catalog";
import { DeleteProductButton } from "@/components/vendors/delete-product-button";
import { ShippingRegionsForm } from "@/components/vendors/shipping-regions-form";
import { getSessionProfile, canAccessVendor } from "@/lib/auth/session";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { getRequestLocale } from "@/lib/i18n/locale";
import { getVendorImportQuota } from "@/lib/import-limits/queries";
import { listCjImportedProductsForVendor } from "@/lib/products/queries";
import { listSourcingRegions } from "@/lib/sourcing/queries";
import { getVendorForOwner } from "@/lib/vendors/queries";

export const dynamic = "force-dynamic";

/**
 * CJ Dropshipping Portal — catalog + shipping regions + CJ route manager.
 * Manual / Independent Vendor products never appear here.
 */
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

  const [cjProducts, regions, quota, locale] = await Promise.all([
    listCjImportedProductsForVendor(vendor.id),
    listSourcingRegions(),
    getVendorImportQuota(vendor.id),
    getRequestLocale(),
  ]);
  const t = getDictionary(locale);
  const selectableRegions = regions.filter(
    (region) => !region.id.startsWith("fallback-"),
  );

  const quotaHints = quota
    ? {
        minActiveItems: quota.min_active_items,
        maxImportItems: quota.max_import_items,
        catalogItemCount: quota.catalog_item_count,
        activeItemCount: quota.active_item_count,
        remainingImportSlots: quota.remaining_import_slots,
        itemFeeUsdt: quota.item_fee_usdt,
        atImportLimit: quota.at_import_limit,
        meetsMinimum: quota.meets_minimum,
      }
    : null;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t.sourcing.title}
        </h1>
        <p className="max-w-2xl text-zinc-600">{t.sourcing.subtitle}</p>
        <p className="text-sm text-zinc-500">
          <Link href="/vendor/dropship" className="font-medium underline">
            CJ Dropshipping hub
          </Link>
          . Custom-source products stay in the Independent Vendor portal — no
          shipping-fee or route tools there.
        </p>
      </div>

      <section className="space-y-3 rounded-2xl border border-sky-200 bg-sky-50/40 p-4 sm:p-5">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight text-sky-950">
            Shipping regions &amp; logistics
          </h2>
          <p className="max-w-2xl text-sm text-zinc-600">
            Limit which buyer locations can purchase your CJ catalog. Product
            routes and CJ shipping calculations apply on top of this store
            default. Not used for Independent Vendor / manual products.
          </p>
        </div>
        <ShippingRegionsForm vendor={vendor} regions={selectableRegions} />
      </section>

      <UnifiedSupplierSourcingCatalog
        regions={regions.map((region) => ({
          id: region.id,
          code: region.code,
          name: region.name,
        }))}
        importDisabled={quota?.at_import_limit ?? false}
        quota={quotaHints}
      />

      <div className="flex flex-col gap-3 rounded-xl border border-sky-200 bg-white px-3 py-3 text-sm text-zinc-800 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <p className="min-w-0 break-words">Browse the live CJ catalog or open imported CJ listings.</p>
        <div className="grid w-full max-w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap">
          <Link
            href="/vendor/integrations"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-sky-700 px-3 py-2 text-sm font-medium text-white hover:bg-sky-800 sm:min-h-0 sm:w-auto"
          >
            Open CJ catalog
          </Link>
          <Link
            href="/vendor/dropship/imported"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-950 hover:bg-sky-100 sm:min-h-0 sm:w-auto"
          >
            Imported products
          </Link>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold tracking-tight text-sky-950">
          {t.sourcing.routeManagerTitle}
        </h2>
        <p className="text-sm text-zinc-600">
          Regional supplier routes and shipping estimates for CJ imports only.
        </p>
      </div>

      {cjProducts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-sky-200 bg-white px-6 py-10 text-center text-sm text-zinc-600">
          No CJ imports yet. Import from the catalog to manage regional routes.
        </div>
      ) : (
        <ul className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-sky-200 bg-white">
          {cjProducts.map((product) => (
            <li
              key={product.id}
              className="flex min-w-0 flex-col gap-2 px-3 py-3 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-4"
            >
              <div className="min-w-0">
                <p className="break-words font-medium text-zinc-950">{product.name}</p>
                <p className="text-zinc-500">
                  CJ import · {product.status}
                </p>
              </div>
              <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-end">
                <Link
                  href={`/vendor/sourcing/${product.id}`}
                  className="inline-flex min-h-11 w-full items-center justify-center font-medium text-sky-950 underline sm:min-h-0 sm:w-auto sm:justify-start"
                >
                  {t.sourcing.manageRoutes}
                </Link>
                <DeleteProductButton
                  productId={product.id}
                  productName={product.name}
                  mode="cj_import"
                  label="Remove"
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-900 hover:bg-rose-100 disabled:opacity-60 sm:min-h-0 sm:w-auto"
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
