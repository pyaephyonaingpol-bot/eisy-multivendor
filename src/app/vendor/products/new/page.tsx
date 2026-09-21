import Link from "next/link";
import { redirect } from "next/navigation";
import { ProductCreateForm } from "@/components/vendors/product-create-form";
import { getSessionProfile } from "@/lib/auth/session";
import { listActiveCategories } from "@/lib/categories/queries";
import { listSourcingRegions } from "@/lib/sourcing/queries";
import { getVendorForOwner } from "@/lib/vendors/queries";

export const dynamic = "force-dynamic";

export default async function NewVendorProductPage() {
  const session = await getSessionProfile();

  if (!session) {
    redirect("/login?next=/vendor/products/new");
  }

  const vendor = await getVendorForOwner(session.userId);

  if (!vendor) {
    redirect("/vendor/apply");
  }

  const [categories, sourcingRegions] = await Promise.all([
    listActiveCategories(),
    listSourcingRegions(),
  ]);

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Independent Vendor
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Add product</h1>
        <p className="max-w-xl text-zinc-600">
          Create a manually sourced physical or digital item for{" "}
          <strong>{vendor.name}</strong>.
        </p>
      </div>

      {vendor.status !== "approved" ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Your store is <strong>{vendor.status}</strong>. You can still save products, but
          they will not appear on the public storefront until an admin approves you.
        </div>
      ) : null}

      <ProductCreateForm
        categories={categories}
        sourcingRegions={sourcingRegions}
      />

      <p className="text-sm text-zinc-500">
        <Link href="/vendor/products" className="underline">
          Back to products
        </Link>
      </p>
    </section>
  );
}
