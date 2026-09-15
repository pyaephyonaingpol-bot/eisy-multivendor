import Link from "next/link";
import { redirect } from "next/navigation";
import { ShippingRegionsForm } from "@/components/vendors/shipping-regions-form";
import { StoreBrandingForm } from "@/components/vendors/store-branding-form";
import { VendorKycForm } from "@/components/vendors/vendor-kyc-form";
import { canAccessVendor, getSessionProfile } from "@/lib/auth/session";
import { listSourcingRegions } from "@/lib/sourcing/queries";
import { getVendorForOwner } from "@/lib/vendors/queries";

export const dynamic = "force-dynamic";

export default async function VendorSettingsPage() {
  const session = await getSessionProfile();
  if (!session) {
    redirect("/login?next=/vendor/settings");
  }
  if (!canAccessVendor(session.role)) {
    redirect("/");
  }

  const vendor = await getVendorForOwner(session.userId);
  if (!vendor) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Store settings</h1>
        <p className="text-zinc-600">
          Apply as a vendor first, then customize branding, shipping regions, and
          submit KYC verification.
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

  const regions = await listSourcingRegions();
  // Prefer real DB region ids for form values; hide offline fallbacks.
  const selectableRegions = regions.filter(
    (region) => !region.id.startsWith("fallback-"),
  );

  return (
    <div className="space-y-10">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Store settings</h1>
        <p className="max-w-2xl text-sm text-zinc-600">
          Branding, shipping regions, and KYC apply to both vendor and dropshipper
          stores. Your public store is at{" "}
          <Link href={`/store/${vendor.slug}`} className="font-medium underline">
            /store/{vendor.slug}
          </Link>
          .
        </p>
      </div>

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">Store branding</h2>
          <p className="max-w-2xl text-sm text-zinc-600">
            Set the store name buyers see as Sold by, upload a logo, and choose
            your public store URL.
          </p>
        </div>
        <StoreBrandingForm vendor={vendor} />
      </section>

      <section className="space-y-4 border-t border-zinc-200 pt-8">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">
            Shipping regions
          </h2>
          <p className="max-w-2xl text-sm text-zinc-600">
            Limit which buyer locations can see and purchase your catalog.
            Product-level ships-to and supplier routes still apply on top of
            this store default.
          </p>
        </div>
        <ShippingRegionsForm vendor={vendor} regions={selectableRegions} />
      </section>

      <section className="space-y-4 border-t border-zinc-200 pt-8">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">
            KYC verification
          </h2>
          <p className="max-w-2xl text-sm text-zinc-600">
            Upload a passport, national ID, or trade license. Publishing products
            and wallet withdrawals require an approved KYC status.
          </p>
        </div>
        <VendorKycForm vendor={vendor} />
      </section>
    </div>
  );
}
