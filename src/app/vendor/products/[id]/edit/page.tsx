import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ProductForm } from "@/components/vendors/product-form";
import { getSessionProfile } from "@/lib/auth/session";
import { listActiveCategories } from "@/lib/categories/queries";
import { getVendorProductById } from "@/lib/products/queries";
import { getVendorForOwner } from "@/lib/vendors/queries";

export const dynamic = "force-dynamic";

type EditVendorProductPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditVendorProductPage({
  params,
}: EditVendorProductPageProps) {
  const { id } = await params;
  const session = await getSessionProfile();

  if (!session) {
    redirect(`/login?next=/vendor/products/${id}/edit`);
  }

  const vendor = await getVendorForOwner(session.userId);

  if (!vendor) {
    redirect("/vendor/apply");
  }

  const product = await getVendorProductById(vendor.id, id);

  if (!product) {
    notFound();
  }

  const categories = await listActiveCategories();

  // Ensure the current category remains selectable even if deactivated.
  const categoryOptions =
    product.category_id &&
    !categories.some((category) => category.id === product.category_id)
      ? [
          ...categories,
          {
            id: product.category_id,
            name: "Current category (inactive)",
            slug: "current",
            description: null,
            sort_order: 0,
            is_active: false,
            created_at: product.created_at,
            updated_at: product.updated_at,
          },
        ]
      : categories;

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Catalog
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Edit product</h1>
        <p className="max-w-xl text-zinc-600">
          Update details, images, and availability for <strong>{product.name}</strong>.
        </p>
      </div>

      {vendor.status !== "approved" ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Your store is <strong>{vendor.status}</strong>. You can still edit products, but
          they will not appear on the public storefront until an admin approves you.
        </div>
      ) : null}

      <ProductForm categories={categoryOptions} product={product} />

      <p className="text-sm text-zinc-500">
        <Link href="/vendor/products" className="underline">
          Back to products
        </Link>
      </p>
    </section>
  );
}
