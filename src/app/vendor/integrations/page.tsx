import Link from "next/link";
import { redirect } from "next/navigation";
import { ExternalSupplierCatalogPanel } from "@/components/suppliers/external-supplier-catalog-panel";
import { SupplierCredentialsForm } from "@/components/suppliers/supplier-credentials-form";
import { getSessionProfile, canAccessVendor } from "@/lib/auth/session";
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

  const credentials = await listVendorSupplierCredentials();

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

      <SupplierCredentialsForm
        providers={providers ?? []}
        existing={credentials.rows ?? []}
      />

      <ExternalSupplierCatalogPanel
        providerKind="cj_dropshipping"
        providerLabel="CJ Dropshipping"
      />
      <ExternalSupplierCatalogPanel
        providerKind="dsers"
        providerLabel="DSers / AliExpress"
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
