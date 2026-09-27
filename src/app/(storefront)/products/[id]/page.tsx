import Link from "next/link";
import { SoldByBadge } from "@/components/storefront/sold-by-badge";
import { notFound } from "next/navigation";
import { ImportToMyStorePanel } from "@/components/storefront/import-to-my-store-panel";
import { ProductDetailBuyLayout } from "@/components/storefront/product-detail-buy-layout";
import { ProductSpecificationsTable } from "@/components/storefront/product-specifications-table";
import { CjLiveShippingEstimate } from "@/components/storefront/cj-live-shipping-estimate";
import { RegionPriceDisplay } from "@/components/storefront/region-price-display";
import { formatMoney } from "@/lib/money";
import { getPublicProductById } from "@/lib/products/queries";
import {
  getBuyerSourcingContext,
  resolveProductSupplierRoute,
} from "@/lib/sourcing/queries";
import {
  priceForBuyerCountryAsync,
  weightGramsFromProduct,
} from "@/lib/shipping/region-pricing";

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
  const regionPrice = await priceForBuyerCountryAsync({
    basePriceUsdt: Number(product.price),
    countryCode: sourcing.countryCode,
    weightGrams: weightGramsFromProduct(product),
  });

  return (
    <article className="mx-auto w-full min-w-0 max-w-5xl space-y-10 overflow-x-hidden">
      <ProductDetailBuyLayout
        productId={product.id}
        vendorId={product.vendor_id}
        name={product.name}
        basePrice={regionPrice.priceUsdt}
        currency="USDT"
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
          <RegionPriceDisplay pricing={regionPrice} size="lg" />
          {product.compare_at_price != null ? (
            <p className="text-sm text-zinc-500 line-through">
              {formatMoney(
                Number(product.compare_at_price),
                regionPrice.displayCurrency === "USDT"
                  ? "USDT"
                  : regionPrice.displayCurrency,
              )}
            </p>
          ) : null}
          <p className="text-sm text-zinc-500">
            Delivering to {sourcing.countryCode}
            {productType === "digital"
              ? product.download_label
                ? ` · Digital download · ${product.download_label}`
                : " · Digital download"
              : availableStock > 0
                ? Number.isFinite(availableStock)
                  ? ` · ${availableStock} in stock`
                  : " · In stock"
                : " · Out of stock"}
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
          regionPrice.freeShipping ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-3 text-sm text-emerald-950">
              <p className="font-medium">Free Shipping to {sourcing.countryCode}</p>
              <p className="mt-1 text-emerald-900/80">
                Shipping is already included in the price for{" "}
                {regionPrice.targetMarket === "AE"
                  ? "UAE (AED)"
                  : regionPrice.targetMarket === "PH"
                    ? "Philippines (PHP)"
                    : "Myanmar (USD)"}{" "}
                buyers.
              </p>
            </div>
          ) : (
            <CjLiveShippingEstimate
              productId={product.id}
              route={supplierRoute}
              countryCode={sourcing.countryCode}
              regionName={sourcing.regionName}
              fromProfile={sourcing.fromProfile}
              isAuthenticated={sourcing.isAuthenticated}
              enableLiveCj={
                product.catalog_kind === "cj_import" ||
                Boolean(product.is_dropship)
              }
            />
          )
        ) : null}
      </ProductDetailBuyLayout>

      <ImportToMyStorePanel
        productId={product.id}
        productVendorId={product.vendor_id}
        productPrice={regionPrice.priceUsdt}
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
