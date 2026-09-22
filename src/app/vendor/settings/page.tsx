import Link from "next/link";
import { redirect } from "next/navigation";
import { StoreBrandingForm } from "@/components/vendors/store-branding-form";
import { canAccessVendor, getSessionProfile } from "@/lib/auth/session";
import { getVendorForOwner } from "@/lib/vendors/queries";

export const dynamic = "force-dynamic";

/**
 * Independent Vendor — Store branding only.
 * Shipping regions / logistics live exclusively in the CJ Dropshipping portal.
 */
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
          Apply as a vendor first, then customize your store branding.
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

  return (
    <div className="space-y-10">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Independent Vendor
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Store</h1>
        <p className="max-w-2xl text-sm text-zinc-600">
          Branding for your public store at{" "}
          <Link href={`/store/${vendor.slug}`} className="font-medium underline">
            /store/{vendor.slug}
          </Link>
          . Shipping fees, regional routes, and logistics are managed only in the{" "}
          <Link href="/vendor/dropship" className="font-medium underline">
            CJ Dropshipping portal
          </Link>
          . Contact and KYC live under{" "}
          <Link href="/vendor/profile" className="font-medium underline">
            Account
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
    </div>
  );
}
