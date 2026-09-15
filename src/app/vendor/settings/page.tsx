import Link from "next/link";
import { redirect } from "next/navigation";
import { StoreBrandingForm } from "@/components/vendors/store-branding-form";
import { canAccessVendor, getSessionProfile } from "@/lib/auth/session";
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
          Apply as a vendor first, then customize your store name, logo, and public URL.
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
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Store branding</h1>
        <p className="max-w-2xl text-sm text-zinc-600">
          Set the store name buyers see as <strong>Sold by</strong>, upload a logo, and
          choose your public store URL at{" "}
          <Link href={`/store/${vendor.slug}`} className="font-medium underline">
            /store/{vendor.slug}
          </Link>
          .
        </p>
      </div>
      <StoreBrandingForm vendor={vendor} />
    </div>
  );
}
