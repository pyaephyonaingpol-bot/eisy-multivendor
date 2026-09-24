import Link from "next/link";
import { SoldByBadge } from "@/components/storefront/sold-by-badge";
import { notFound } from "next/navigation";
import { ImportToMyStorePanel } from "@/components/storefront/import-to-my-store-panel";
import { ProductDetailBuyLayout } from "@/components/storefront/product-detail-buy-layout";
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
  const images = Array.isArray(product.images)
    ? product.images.filter((url): url is string => Boolean(url?.trim()))
    : [];
  const availableStock = product.available_stock;
  const outOfStock =
    productType === "physical" &&
    Number.isFinite(availableStock) &&
    availableStock <= 0;
  const variants = product.catalog_variants ?? [];

  return (
    <article className="mx-auto w-full min-w-0 max-w-5xl space-y-10 overflow-x-hidden">
      <ProductDetailBuyLayout
        productId={product.id}
        vendorId={product.vendor_id}
        name={product.name}
        basePrice={Number(product.price)}
        currency={MARKETPLACE_CURRENCY}
        images={images}
        productType={productType}
        maxQuantity={
          productType === "physical" && Number.isFinite(availableStock)
            ? availableStock
            : null
        }
        disabled={outOfStock}
        variants={variants}
      >
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
            {variants.length > 1
              ? ` · ${variants.length} color/size options`
              : null}
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
      </ProductDetailBuyLayout>

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

      <ProductSpecificationsTable specifications={product.specifications} />
    </article>
  );
}
