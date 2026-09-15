import Link from "next/link";
import { SoldByBadge } from "@/components/storefront/sold-by-badge";
import { formatMoney, MARKETPLACE_CURRENCY } from "@/lib/money";
import type { PublicProductSummary } from "@/lib/products/queries";

export function ProductCard({ product }: { product: PublicProductSummary }) {
  const image = product.images[0] ?? null;
  const vendorApproved = product.vendor?.status === "approved";

  return (
    <Link
      href={`/products/${product.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white transition hover:border-zinc-300 hover:shadow-sm"
    >
      <div className="aspect-[4/3] overflow-hidden bg-zinc-100">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt={product.name}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-zinc-400">
            No image
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="space-y-1.5">
          <p className="line-clamp-2 text-sm font-semibold text-zinc-950">{product.name}</p>
          {vendorApproved && product.vendor ? (
            <SoldByBadge vendor={product.vendor} as="text" />
          ) : null}
        </div>
        <div className="mt-auto flex items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-zinc-950">
            {formatMoney(Number(product.price), MARKETPLACE_CURRENCY)}
          </p>
          {product.compare_at_price != null ? (
            <p className="text-xs text-zinc-400 line-through">
              {formatMoney(Number(product.compare_at_price), MARKETPLACE_CURRENCY)}
            </p>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

export function ProductGrid({ products }: { products: PublicProductSummary[] }) {
  if (products.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center">
        <p className="text-sm font-medium text-zinc-950">No products available yet</p>
        <p className="mt-1 text-sm text-zinc-500">
          Active products will appear here when listings go live.
        </p>
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
      {products.map((product) => (
        <li key={product.id}>
          <ProductCard product={product} />
        </li>
      ))}
    </ul>
  );
}
