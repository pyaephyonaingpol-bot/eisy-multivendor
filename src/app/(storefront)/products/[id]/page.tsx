import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToCartButton } from "@/components/storefront/add-to-cart-button";
import { ImportToMyStorePanel } from "@/components/storefront/import-to-my-store-panel";
import { ProductSpecificationsTable } from "@/components/storefront/product-specifications-table";
import { RegionalShippingEstimate } from "@/components/storefront/regional-shipping-estimate";
import { formatMoney, MARKETPLACE_CURRENCY } from "@/lib/money";
import { getPublicProductById } from "@/lib/products/queries";
import {
  getBuyerSourcingContext,
  resolveProductSupplierRoute,
} from "@/lib/sourcing/queries";
import type { ProductType } from "@/lib/types/database";

export const dynamic = "force-dynamic";

type ProductDetailPageProps = {
  params: Promise<{ id: string }>;
};

function typeLabel(type: ProductType) {
  return type === "digital" ? "Digital" : "Physical";
}

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
    <article className="mx-auto max-w-5xl space-y-10">
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="aspect-square overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50">
            {heroImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={heroImage}
                alt={product.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-zinc-400">
                No image
              </div>
            )}
          </div>
          {images.length > 1 ? (
            <ul className="grid grid-cols-4 gap-2">
              {images.slice(0, 4).map((url) => (
                <li
                  key={url}
                  className="aspect-square overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="h-full w-full object-cover" />
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="space-y-5">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200">
                {typeLabel(productType)}
              </span>
              {product.is_dropship ? (
                <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-inset ring-emerald-200">
                  Dropship listing
                </span>
              ) : null}
              {product.sku ? (
                <span className="text-xs text-zinc-500">SKU {product.sku}</span>
              ) : null}
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">
              {product.name}
            </h1>
            {product.vendor ? (
              <p className="text-sm text-zinc-600">
                Sold by{" "}
                <Link
                  href={`/vendors/${product.vendor.slug}`}
                  className="font-medium text-zinc-950 underline"
                >
                  {product.vendor.name}
                </Link>
                {product.is_dropship && product.source_vendor ? (
                  <>
                    {" "}
                    · Fulfilled by{" "}
                    <span className="font-medium text-zinc-800">
                      {product.source_vendor.name}
                    </span>
                  </>
                ) : null}
              </p>
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
                  ? `${Number.isFinite(availableStock) ? availableStock : "In"} in stock${product.is_dropship ? " (supplier)" : ""}`
                  : "Out of stock"}
            </p>
          </div>

          {product.description ? (
            <div className="space-y-2">
              <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
                Description
              </h2>
              <p className="whitespace-pre-wrap text-zinc-700">{product.description}</p>
            </div>
          ) : null}

          {productType === "physical" ? (
            <RegionalShippingEstimate
              route={supplierRoute}
              countryCode={sourcing.countryCode}
              regionName={sourcing.regionName}
            />
          ) : null}

          <AddToCartButton
            productId={product.id}
            vendorId={product.vendor_id}
            name={product.name}
            price={Number(product.price)}
            currency={MARKETPLACE_CURRENCY}
            imageUrl={heroImage}
            productType={productType}
            maxQuantity={
              productType === "physical" && Number.isFinite(availableStock)
                ? availableStock
                : null
            }
            disabled={outOfStock}
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
