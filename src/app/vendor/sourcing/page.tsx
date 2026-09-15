import Link from "next/link";
import { redirect } from "next/navigation";
import { UnifiedSupplierSourcingCatalog } from "@/components/suppliers/unified-supplier-sourcing-catalog";
import { getSessionProfile, canAccessVendor } from "@/lib/auth/session";
import { getVendorImportQuota } from "@/lib/import-limits/queries";
import { listProductsForVendor } from "@/lib/products/queries";
import { listSourcingRegions } from "@/lib/sourcing/queries";
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

  const [products, regions, quota] = await Promise.all([
    listProductsForVendor(vendor.id),
    listSourcingRegions(),
    getVendorImportQuota(vendor.id),
  ]);
  const sourceProducts = products.filter((product) => !product.is_dropship);

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
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Product sourcing
        </h1>
        <p className="max-w-2xl text-zinc-600">
          Browse DSers, CJ Dropshipping, Spocket, and POD (Printful / Printify)
          catalogs, filter by ship-to region and delivery speed, then import
          listings that meet the 10-unit stock minimum. Dropship routes still
          inherit per-region supplier routing below.
        </p>
      </div>

      <UnifiedSupplierSourcingCatalog
        regions={regions.map((region) => ({
          id: region.id,
          code: region.code,
          name: region.name,
        }))}
        importDisabled={quota?.at_import_limit ?? false}
        quota={quotaHints}
      />

      <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-800 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <p>
          Connect API keys for live catalogs under Integrations. Mock catalogs
          work without credentials.
        </p>
        <Link
          href="/vendor/integrations"
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-zinc-950 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 sm:min-h-0"
        >
          Manage supplier credentials
        </Link>
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold tracking-tight">
          Regional route manager
        </h2>
        <p className="text-sm text-zinc-600">
          Attach CJ, DSers, Spocket, POD, or warehouse routes per buyer region
          for catalog source products.
        </p>
      </div>

      {sourceProducts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center text-sm text-zinc-600">
          No source catalog products yet. Import from the multi-supplier catalog
          above, or add a product and attach regional supplier routes.
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
