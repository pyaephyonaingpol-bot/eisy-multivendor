import Link from "next/link";
import {
  getPrintifyProductImageUrl,
  getPrintifyProducts,
} from "@/lib/printify";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Simple Printify catalog preview for verifying API key + shop id.
 * Visit /printify-test after setting PRINTIFY_API_KEY and PRINTIFY_SHOP_ID.
 */
export default async function PrintifyTestPage() {
  const result = await getPrintifyProducts({ page: 1, limit: 24 });

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      <div className="space-y-2">
        <p className="text-sm text-zinc-500">
          <Link href="/" className="underline underline-offset-4">
            Home
          </Link>{" "}
          / Printify test
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">
          Printify products
        </h1>
        <p className="text-sm text-zinc-600">
          Fetched via <code className="rounded bg-zinc-100 px-1">getPrintifyProducts()</code>{" "}
          using <code className="rounded bg-zinc-100 px-1">PRINTIFY_API_KEY</code> and{" "}
          <code className="rounded bg-zinc-100 px-1">PRINTIFY_SHOP_ID</code>
          {result.shopId ? (
            <>
              {" "}
              (shop <span className="font-mono">{result.shopId}</span>)
            </>
          ) : null}
          .
        </p>
      </div>

      {!result.ok ? (
        <div
          className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-900"
          role="alert"
        >
          <p className="font-medium">Could not load Printify products</p>
          <p className="mt-1">{result.error}</p>
          <p className="mt-3 text-rose-800/80">
            Also try{" "}
            <Link href="/api/printify/products" className="underline">
              /api/printify/products
            </Link>
            .
          </p>
        </div>
      ) : result.products.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center text-sm text-zinc-600">
          No products in this Printify shop yet. Create a product in Printify,
          then refresh.
        </p>
      ) : (
        <>
          <p className="text-sm text-zinc-500">
            Showing {result.products.length} of {result.total} product
            {result.total === 1 ? "" : "s"}
            {result.lastPage > 1 ? ` · page ${result.page}/${result.lastPage}` : ""}
          </p>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {result.products.map((product) => {
              const imageUrl = getPrintifyProductImageUrl(product);
              const enabledVariants =
                product.variants?.filter((v) => v.is_enabled !== false) ?? [];
              const priceCents = enabledVariants[0]?.price;
              const price =
                typeof priceCents === "number"
                  ? (priceCents / 100).toFixed(2)
                  : null;

              return (
                <li
                  key={product.id}
                  className="overflow-hidden rounded-2xl border border-zinc-200 bg-white"
                >
                  <div className="aspect-square bg-zinc-50">
                    {imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={imageUrl}
                        alt={product.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-zinc-400">
                        No image
                      </div>
                    )}
                  </div>
                  <div className="space-y-1 px-4 py-3">
                    <h2 className="line-clamp-2 text-sm font-semibold text-zinc-950">
                      {product.title}
                    </h2>
                    <p className="font-mono text-[11px] text-zinc-400">
                      {product.id}
                    </p>
                    {price ? (
                      <p className="text-sm text-zinc-700">From ${price}</p>
                    ) : null}
                    <p className="text-xs text-zinc-500">
                      {enabledVariants.length} variant
                      {enabledVariants.length === 1 ? "" : "s"}
                      {product.visible === false ? " · hidden" : ""}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </main>
  );
}
