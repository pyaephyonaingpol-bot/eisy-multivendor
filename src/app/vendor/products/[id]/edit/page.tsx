import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DeleteProductButton } from "@/components/vendors/delete-product-button";
import { ProductForm } from "@/components/vendors/product-form";
import { getSessionProfile } from "@/lib/auth/session";
import { listActiveCategories } from "@/lib/categories/queries";
import { getVendorProductById } from "@/lib/products/queries";
import { listSourcingRegions } from "@/lib/sourcing/queries";
import { getVendorForOwner } from "@/lib/vendors/queries";

export const dynamic = "force-dynamic";

type EditVendorProductPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ catalog?: string }>;
};

export default async function EditVendorProductPage({
  params,
  searchParams,
}: EditVendorProductPageProps) {
  const { id } = await params;
  const { catalog } = await searchParams;
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

  // Bare /vendor/products/[id]/edit is Independent Vendor only — bounce CJ imports.
  if (product.catalog_kind === "cj_import" && catalog !== "cj") {
    redirect("/vendor/dropship/imported");
  }

  const isCj = product.catalog_kind === "cj_import" || catalog === "cj";
  const backHref = isCj ? "/vendor/dropship/imported" : "/vendor/products";
  const backLabel = isCj ? "Back to CJ products" : "Back to products";

  const [categories, sourcingRegions] = await Promise.all([
    listActiveCategories(),
    listSourcingRegions(),
  ]);

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
        <p
          className={`text-sm font-medium uppercase tracking-wide ${
            isCj ? "text-sky-800" : "text-zinc-500"
          }`}
        >
          {isCj ? "CJ Dropshipping import" : "Independent Vendor"}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {isCj ? "Edit CJ product" : "Edit product"}
        </h1>
        <p className="max-w-xl text-zinc-600">
          Update details, images, and availability for{" "}
          <strong>{product.name}</strong>
          {isCj
            ? ". Stock continues to sync from CJ; keep this listing in the CJ products workflow."
            : "."}
        </p>
      </div>

      {isCj ? (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
          This listing belongs to the <strong>CJ import</strong> catalog. Use
          the CJ Dropshipping portal to manage it.
        </div>
      ) : null}

      {vendor.status !== "approved" ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Your store is <strong>{vendor.status}</strong>. You can still edit products, but
          they will not appear on the public storefront until an admin approves you.
        </div>
      ) : null}

      <ProductForm
        categories={categoryOptions}
        product={product}
        sourcingRegions={sourcingRegions}
        showLogistics={isCj}
      />

      {isCj ? (
        <p className="text-sm text-zinc-600">
          <Link
            href={`/vendor/sourcing/${product.id}`}
            className="font-medium text-sky-950 underline"
          >
            Manage CJ regional routes &amp; shipping
          </Link>
          {" · "}
          <Link
            href="/vendor/sourcing"
            className="font-medium text-sky-950 underline"
          >
            Browse CJ catalog
          </Link>
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 pt-6">
        <p className="text-sm text-zinc-500">
          <Link href={backHref} className="underline">
            {backLabel}
          </Link>
        </p>
        <DeleteProductButton
          productId={product.id}
          productName={product.name}
          mode={isCj ? "cj_import" : "product"}
          label={isCj ? "Remove from store" : "Delete product"}
          className="inline-flex items-center justify-center rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-900 hover:bg-rose-100 disabled:opacity-60"
        />
      </div>
    </section>
  );
}
