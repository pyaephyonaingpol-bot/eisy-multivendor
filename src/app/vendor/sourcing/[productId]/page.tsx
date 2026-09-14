import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SupplierRoutesManager } from "@/components/vendors/supplier-routes-manager";
import { getSessionProfile, canAccessVendor } from "@/lib/auth/session";
import { getVendorProductById } from "@/lib/products/queries";
import {
  listProductSupplierRoutes,
  listSourcingRegions,
  listSupplierProviders,
} from "@/lib/sourcing/queries";
import { getVendorForOwner } from "@/lib/vendors/queries";

export const dynamic = "force-dynamic";

type VendorSourcingDetailPageProps = {
  params: Promise<{ productId: string }>;
};

export default async function VendorSourcingDetailPage({
  params,
}: VendorSourcingDetailPageProps) {
  const { productId } = await params;
  const session = await getSessionProfile();

  if (!session) {
    redirect(`/login?next=/vendor/sourcing/${productId}`);
  }

  if (!canAccessVendor(session.role)) {
    redirect("/");
  }

  const vendor = await getVendorForOwner(session.userId);

  if (!vendor) {
    redirect("/vendor/apply");
  }

  const product = await getVendorProductById(vendor.id, productId);

  if (!product) {
    notFound();
  }

  const [routes, regions, providers] = await Promise.all([
    listProductSupplierRoutes(
      product.is_dropship && product.source_product_id
        ? product.source_product_id
        : product.id,
    ),
    listSourcingRegions(),
    listSupplierProviders(),
  ]);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Sourcing
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{product.name}</h1>
        <p className="max-w-2xl text-zinc-600">
          Route this catalog SKU to nearby CJ Dropshipping, DSers, Print-on-Demand, or
          internal warehouses by buyer region. Checkout still settles in USDT only.
        </p>
      </div>

      <SupplierRoutesManager
        productId={
          product.is_dropship && product.source_product_id
            ? product.source_product_id
            : product.id
        }
        productName={product.name}
        routes={routes}
        regions={regions}
        providers={providers}
        isDropshipListing={product.is_dropship}
      />

      <p className="text-sm text-zinc-500">
        <Link href={`/vendor/products/${product.id}/edit`} className="underline">
          Back to product edit
        </Link>
        {" · "}
        <Link href="/vendor/sourcing" className="underline">
          All sourcing
        </Link>
      </p>
    </div>
  );
}
