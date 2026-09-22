import Link from "next/link";
import { SoldByBadge } from "@/components/storefront/sold-by-badge";
import { notFound } from "next/navigation";
import { ImportToMyStorePanel } from "@/components/storefront/import-to-my-store-panel";
import { ProductPurchasePanel } from "@/components/storefront/product-purchase-panel";
import { ProductSpecificationsTable } from "@/components/storefront/product-specifications-table";
import { CjLiveShippingEstimate } from "@/components/storefront/cj-live-shipping-estimate";
import { formatMoney, MARKETPLACE_CURRENCY } from "@/lib/money";
import { getPublicProductById } from "@/lib/products/queries";
import {
  getBuyerSourcingContext,
  resolveProductSupplierRoute,
} from "@/lib/sourcing/queries";

export const dynamic = "force-dynamic";

type ProductDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProductDetailPage({ params }: ProductDetailPageProps) {
  const { id } = await params;
  const product = await getPublicProductById(id);

  if (!product) {
    notFound();
  }

  // Hide products from non-approved vendors on the public storefront.
  if (product.vendor && product.vendor.status !== "approved") {
    notFound();
  }

  const productType = product.product_type ?? "physical";
  const sourcing = await getBuyerSourcingContext();
  const supplierRoute =
    productType === "physical"
      ? await resolveProductSupplierRoute(product.id, sourcing.countryCode)
      : null;
  const images = product.images ?? [];
  const heroImage = images[0] ?? null;
  const availableStock = product.available_stock;
  const outOfStock =
    productType === "physical" &&
    Number.isFinite(availableStock) &&
    availableStock <= 0;

  return (
    <article className="mx-auto w-full min-w-0 max-w-5xl space-y-10 overflow-x-hidden">
      <div className="grid min-w-0 gap-8 lg:grid-cols-2">
        <div className="min-w-0 space-y-3">
          <div className="aspect-square w-full overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50">
            {heroImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={heroImage}
                alt={product.name}
                className="h-full w-full object-contain object-center p-3"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-zinc-400">
                No image
              </div>
            )}
          </div>
          {images.length > 1 ? (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {images.slice(0, 4).map((url) => (
                <li
                  key={url}
                  className="aspect-square overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt=""
                    className="h-full w-full object-contain object-center p-1"
                  />
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="min-w-0 space-y-5">
          <div className="min-w-0 space-y-2">
            <h1 className="break-words text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl">
              {product.name}
            </h1>
            {product.vendor ? (
              <SoldByBadge vendor={product.vendor} size="md" />
            ) : null}
          </div>

          <div className="space-y-1">
            <p className="text-2xl font-semibold text-zinc-950">
              {formatMoney(Number(product.price), MARKETPLACE_CURRENCY)}
            </p>
            {product.compare_at_price != null ? (
              <p className="text-sm text-zinc-500 line-through">
                {formatMoney(Number(product.compare_at_price), MARKETPLACE_CURRENCY)}
              </p>
            ) : null}
            <p className="text-sm text-zinc-500">
              {productType === "digital"
                ? product.download_label
                  ? `Digital download · ${product.download_label}`
                  : "Digital download"
                : availableStock > 0
                  ? Number.isFinite(availableStock)
                    ? `${availableStock} in stock`
                    : "In stock"
                  : "Out of stock"}
            </p>
          </div>

          {product.description ? (
            <div className="space-y-2">
              <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
                Description
              </h2>
              <p className="break-words whitespace-pre-wrap text-zinc-700">
                {product.description}
              </p>
            </div>
          ) : null}

          {productType === "physical" ? (
            <CjLiveShippingEstimate
              productId={product.id}
              route={supplierRoute}
              countryCode={sourcing.countryCode}
              regionName={sourcing.regionName}
              enableLiveCj={
                product.catalog_kind === "cj_import" ||
                Boolean(product.is_dropship)
              }
            />
          ) : null}

          <ProductPurchasePanel
            productId={product.id}
            vendorId={product.vendor_id}
            name={product.name}
            basePrice={Number(product.price)}
            currency={MARKETPLACE_CURRENCY}
            imageUrl={heroImage}
            productType={productType}
            maxQuantity={
              productType === "physical" && Number.isFinite(availableStock)
                ? availableStock
                : null
            }
            disabled={outOfStock}
            variants={product.catalog_variants ?? []}
          />

          <ImportToMyStorePanel
            productId={product.id}
            productVendorId={product.vendor_id}
            productPrice={Number(product.price)}
            isDropshipListing={product.is_dropship}
            sourceProductId={product.source_product_id}
          />

          <p className="text-sm text-zinc-500">
            <Link href="/products" className="underline">
              Back to products
            </Link>
          </p>
        </div>
      </div>

      <ProductSpecificationsTable specifications={product.specifications} />
    </article>
  );
}
