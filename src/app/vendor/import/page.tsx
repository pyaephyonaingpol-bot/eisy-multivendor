import Link from "next/link";
import { redirect } from "next/navigation";
import { ImportQuotaBanner } from "@/components/import-limits/import-quota-banner";
import { UnifiedSupplierSourcingCatalog } from "@/components/suppliers/unified-supplier-sourcing-catalog";
import { getSessionProfile, canAccessVendor } from "@/lib/auth/session";
import { getVendorImportQuota } from "@/lib/import-limits/queries";
import { listSourcingRegions } from "@/lib/sourcing/queries";
import { getVendorForOwner } from "@/lib/vendors/queries";

export const dynamic = "force-dynamic";

/**
 * CJ Dropshipping bulk import — lives under Import tools.
 * Marketplace reseller copies of independent vendor products are a separate flow
 * at /vendor/import/marketplace (never mixed into this CJ catalog).
 */
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
        <h1 className="text-2xl font-semibold tracking-tight">
          Bulk import from CJ
        </h1>
        <p className="text-zinc-600">
          Submit a vendor application before you can import CJ Dropshipping
          catalog items.
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
          Bulk import from CJ
        </h1>
        <p className="text-zinc-600">
          Your store must be approved before you can import CJ products.
        </p>
        <Link href="/vendor/apply" className="text-sm font-medium underline">
          Check application status
        </Link>
      </div>
    );
  }

  const [regions, quota] = await Promise.all([
    listSourcingRegions(),
    getVendorImportQuota(vendor.id),
  ]);

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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-sky-800">
            CJ Dropshipping
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Bulk import from CJ
          </h1>
          <p className="max-w-2xl text-zinc-600">
            Search the live CJ Dropshipping catalog, select multiple products,
            and import them into <strong>{vendor.name}</strong> in one click.
            Each import keeps the full color/size matrix under one listing.
            Independent vendor / marketplace products are not included here.
          </p>
          <p className="text-sm text-zinc-500">
            <Link href="/vendor/dropship" className="font-medium underline">
              CJ Dropshipping hub
            </Link>
            {" · "}
            <Link href="/vendor/sourcing" className="font-medium underline">
              Catalog sourcing
            </Link>
            {" · "}
            <Link
              href="/vendor/dropship/imported"
              className="font-medium underline"
            >
              Imported CJ products
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/vendor/import/marketplace"
            className="inline-flex rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
          >
            Marketplace reseller import
          </Link>
          <Link
            href="/vendor/import/extension"
            className="inline-flex rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
          >
            Extension API
          </Link>
        </div>
      </div>

      {quota ? <ImportQuotaBanner quota={quota} /> : null}

      <div className="rounded-xl border border-sky-200 bg-sky-50/50 px-4 py-3 text-sm text-sky-950">
        <p className="font-semibold">CJ catalog only</p>
        <p className="mt-1 text-sky-900/80">
          Bulk import targets CJ Dropshipping supplier products. To resell
          another independent vendor&apos;s listing on this marketplace, use{" "}
          <Link href="/vendor/import/marketplace" className="font-medium underline">
            Marketplace reseller import
          </Link>
          .
        </p>
      </div>

      <UnifiedSupplierSourcingCatalog
        regions={regions.map((region) => ({
          id: region.id,
          code: region.code,
          name: region.name,
          is_default: region.is_default,
        }))}
        importDisabled={quota?.at_import_limit ?? false}
        quota={quotaHints}
      />
    </div>
  );
}
