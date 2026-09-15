import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductGrid } from "@/components/storefront/product-grid";
import { listPublicProductsByVendorId } from "@/lib/products/queries";
import { getApprovedVendorBySlug } from "@/lib/vendors/queries";

export const dynamic = "force-dynamic";

type StorePageProps = {
  params: Promise<{ slug: string }>;
};

export default async function VendorPublicStorePage({ params }: StorePageProps) {
  const { slug } = await params;
  const vendor = await getApprovedVendorBySlug(slug);

  if (!vendor) {
    notFound();
  }

  const products = await listPublicProductsByVendorId(vendor.id);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        {vendor.banner_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={vendor.banner_url}
            alt=""
            className="h-36 w-full object-cover sm:h-48"
          />
        ) : (
          <div className="h-28 bg-gradient-to-r from-zinc-100 via-zinc-50 to-emerald-50 sm:h-36" />
        )}
        <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-end sm:px-6">
          <div className="-mt-12 sm:-mt-14">
            {vendor.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={vendor.logo_url}
                alt={`${vendor.name} logo`}
                className="h-20 w-20 rounded-2xl object-cover ring-4 ring-white sm:h-24 sm:w-24"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-zinc-900 text-2xl font-semibold text-white ring-4 ring-white sm:h-24 sm:w-24">
                {vendor.name.slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl">
              {vendor.name}
            </h1>
            <p className="text-sm text-zinc-500">/store/{vendor.slug}</p>
            {vendor.description ? (
              <p className="max-w-2xl text-sm text-zinc-600">{vendor.description}</p>
            ) : (
              <p className="text-sm text-zinc-500">Products sold by {vendor.name}.</p>
            )}
          </div>
          <Link
            href="/products"
            className="text-sm font-medium text-zinc-600 underline hover:text-zinc-950"
          >
            Browse all products
          </Link>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
            Store catalog
          </h2>
          <p className="text-sm text-zinc-500">
            {products.length} product{products.length === 1 ? "" : "s"}
          </p>
        </div>
        <ProductGrid products={products} />
      </section>
    </div>
  );
}
