import Link from "next/link";
import { redirect } from "next/navigation";
import { ImportQuotaBanner } from "@/components/import-limits/import-quota-banner";
import { ExternalSupplierCatalogPanel } from "@/components/suppliers/external-supplier-catalog-panel";
import { SupplierCredentialsForm } from "@/components/suppliers/supplier-credentials-form";
import { getSessionProfile, canAccessVendor } from "@/lib/auth/session";
import { getVendorImportQuota } from "@/lib/import-limits/queries";
import { listVendorSupplierCredentials } from "@/lib/suppliers/actions";
import { createClient } from "@/lib/supabase/server";
import { getVendorForOwner } from "@/lib/vendors/queries";

export const dynamic = "force-dynamic";

export default async function VendorIntegrationsPage() {
  const session = await getSessionProfile();
  if (!session) redirect("/login?next=/vendor/integrations");
  if (!canAccessVendor(session.role)) redirect("/");

  const vendor = await getVendorForOwner(session.userId);
  if (!vendor) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
        <p className="text-zinc-600">
          Apply as a vendor before connecting CJ Dropshipping or DSers.
        </p>
        <Link href="/vendor/apply" className="underline">
          Apply as a vendor
        </Link>
      </div>
    );
  }

  if (vendor.status !== "approved") {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
        <p className="text-zinc-600">
          Your store must be approved before connecting supplier platforms.
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: providers } = await supabase
    .from("supplier_providers")
    .select("id, name, kind, slug")
    .in("kind", ["cj_dropshipping", "dsers"])
    .eq("is_active", true)
    .order("name");

  const [credentials, quota] = await Promise.all([
    listVendorSupplierCredentials(),
    getVendorImportQuota(vendor.id),
  ]);

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Supplier integrations
        </h1>
        <p className="max-w-2xl text-zinc-600">
          Connect <strong>CJ Dropshipping</strong> and{" "}
          <strong>DSers / AliExpress</strong> to search catalogs, import
          products with supplier SKUs, sync inventory, and auto-route paid
          orders to the supplier API.
        </p>
        <p className="text-sm text-zinc-500">
          Without live API keys the portal uses a safe mock catalog so you can
          still exercise import + fulfillment routing end-to-end.
        </p>
      </div>

      {quota ? <ImportQuotaBanner quota={quota} /> : null}

      <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-3 text-sm text-emerald-950 sm:px-4">
        <p className="font-semibold text-emerald-900">One-click Import to Store</p>
        <p className="mt-1 text-emerald-900/90">
          Search CJ or DSers below, then click <strong>Import to Store</strong> to
          add the item to your active inventory with a default 35% markup. New
          imports are blocked at your maximum catalog cap
          {quota ? ` (${quota.max_import_items})` : ""}. Stay at or above{" "}
          {quota?.min_active_items ?? 10} active items to clear the monthly fee
          floor.
        </p>
      </div>

      <SupplierCredentialsForm
        providers={providers ?? []}
        existing={credentials.rows ?? []}
      />

      <ExternalSupplierCatalogPanel
        providerKind="cj_dropshipping"
        providerLabel="CJ Dropshipping"
        importDisabled={quota?.at_import_limit ?? false}
        quota={
          quota
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
            : null
        }
      />
      <ExternalSupplierCatalogPanel
        providerKind="dsers"
        providerLabel="DSers / AliExpress"
        importDisabled={quota?.at_import_limit ?? false}
        quota={
          quota
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
            : null
        }
      />

      <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
        After checkout payment, orders with CJ/DSers routes enter{" "}
        <code className="rounded bg-white px-1">supplier_fulfillment_jobs</code>
        .         Process them via{" "}
        <code className="rounded bg-white px-1">
          POST /api/cron/fulfill-supplier-orders
        </code>{" "}
        (Bearer CRON_SECRET; also runs daily at 03:00 UTC, and immediately after
        paid checkout).
      </div>
    </div>
  );
}
