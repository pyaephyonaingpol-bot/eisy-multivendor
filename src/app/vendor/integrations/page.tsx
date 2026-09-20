import Link from "next/link";
import { redirect } from "next/navigation";
import { ImportQuotaBanner } from "@/components/import-limits/import-quota-banner";
import { ExternalSupplierCatalogPanel } from "@/components/suppliers/external-supplier-catalog-panel";
import { getSessionProfile, canAccessVendor } from "@/lib/auth/session";
import { getVendorImportQuota } from "@/lib/import-limits/queries";
import {
  hasLiveSupplierCredentials,
  listConfiguredPlatformSuppliers,
} from "@/lib/suppliers/auth";
import {
  supplierIntegrationsMode,
  supplierPlatformLabel,
  type ExternalSupplierKind,
} from "@/lib/suppliers/types";
import { getVendorForOwner } from "@/lib/vendors/queries";

export const dynamic = "force-dynamic";

const CATALOG_PANELS: Array<{
  kind: ExternalSupplierKind;
  label: string;
}> = [
  { kind: "cj_dropshipping", label: "CJ Dropshipping" },
  { kind: "dsers", label: "DSers / AliExpress" },
  { kind: "spocket", label: "Spocket" },
  { kind: "printful", label: "Printful (POD)" },
  { kind: "printify", label: "Printify (POD)" },
];

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
          Apply as a vendor before browsing the platform supplier catalog.
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
          Your store must be approved before importing from the supplier catalog.
        </p>
      </div>
    );
  }

  const quota = await getVendorImportQuota(vendor.id);
  const mode = supplierIntegrationsMode();
  const configured = listConfiguredPlatformSuppliers();

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
          Supplier catalog
        </h1>
        <p className="max-w-2xl text-zinc-600">
          Browse the platform&apos;s unified supplier catalog (CJ, DSers, Spocket,
          Printful, Printify) and one-click import products into your store.
          API keys are configured by the platform — you do not need your own
          supplier accounts.
        </p>
      </div>

      <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-3 text-sm text-emerald-950 sm:px-4">
        <p className="font-semibold text-emerald-900">Platform-managed sources</p>
        <p className="mt-1 text-emerald-900/90">
          Catalog mode: <strong>{mode}</strong>
          {configured.length > 0 ? (
            <>
              {" "}
              · Live sources:{" "}
              {configured.map((k) => supplierPlatformLabel(k)).join(", ")}
            </>
          ) : (
            <> · Using safe mock catalog until an admin configures live API keys.</>
          )}
        </p>
        <p className="mt-2">
          Prefer the multi-supplier workspace with region filters on{" "}
          <Link href="/vendor/sourcing" className="font-medium underline">
            Product sourcing
          </Link>
          .
        </p>
      </div>

      {quota ? <ImportQuotaBanner quota={quota} /> : null}

      <div className="rounded-xl border border-sky-200 bg-sky-50/70 px-3 py-3 text-sm text-sky-950 sm:px-4">
        <p className="font-semibold text-sky-900">Preview & one-click Import to Store</p>
        <p className="mt-1 text-sky-900/90">
          Search a supplier below, open <strong>Preview</strong>, then{" "}
          <strong>Import to Store</strong>. One-click import uses a default 35%
          markup. Imports count toward your catalog cap
          {quota ? ` (${quota.max_import_items})` : ""}.
        </p>
      </div>

      {CATALOG_PANELS.map((panel) => (
        <ExternalSupplierCatalogPanel
          key={panel.kind}
          providerKind={panel.kind}
          providerLabel={panel.label}
          importDisabled={quota?.at_import_limit ?? false}
          quota={quotaHints}
        />
      ))}

      <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
        Paid orders with supplier routes are fulfilled with the platform&apos;s
        source APIs via{" "}
        <code className="rounded bg-white px-1">
          POST /api/cron/fulfill-supplier-orders
        </code>
        .
        {hasLiveSupplierCredentials("cj_dropshipping") ||
        hasLiveSupplierCredentials("dsers")
          ? null
          : " Configure keys under Admin → Supplier APIs or platform env vars."}
      </div>
    </div>
  );
}
