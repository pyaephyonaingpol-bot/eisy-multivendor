import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth/session";
import { formatMoney } from "@/lib/money";
import { listCjImportedProductsForVendor } from "@/lib/products/queries";
import { getVendorForOwner } from "@/lib/vendors/queries";

export const dynamic = "force-dynamic";

export default async function DropshipImportedProductsPage() {
  const session = await getSessionProfile();
  if (!session) {
    redirect("/login?next=/vendor/dropship/imported");
  }

  const vendor = await getVendorForOwner(session.userId);
  if (!vendor) {
    return (
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-sky-800">
          Dropshipper · CJ
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">CJ products</h1>
        <p className="text-zinc-600">
          Apply as a vendor before managing CJ Dropshipping imports.
        </p>
        <Link href="/vendor/apply" className="font-medium underline">
          Apply as a vendor
        </Link>
      </div>
    );
  }

  const products = await listCjImportedProductsForVendor(vendor.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-sky-800">
            Dropshipper · CJ catalog
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">CJ products</h1>
          <p className="max-w-2xl text-zinc-600">
            Products imported from CJ Dropshipping into{" "}
            <strong>{vendor.name}</strong>. Manual vendor listings stay under
            Vendor → Products and are never mixed here.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/vendor/products"
            className="inline-flex rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
          >
            Manual products
          </Link>
          <Link
            href="/vendor/sourcing"
            className="inline-flex rounded-lg bg-sky-950 px-4 py-2 text-sm font-medium text-white hover:bg-sky-900"
          >
            Browse CJ catalog
          </Link>
        </div>
      </div>

      {products.length === 0 ? (
        <div className="rounded-xl border border-dashed border-sky-200 bg-sky-50/40 px-6 py-10 text-center">
          <p className="text-zinc-700">No CJ products imported yet.</p>
          <Link
            href="/vendor/sourcing"
            className="mt-3 inline-flex text-sm font-medium underline"
          >
            Import from CJ Dropshipping
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-sky-100 bg-white">
          {products.map((product) => {
            const thumbnail = product.images?.[0];
            return (
              <li
                key={product.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-4"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50">
                    {thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumbnail}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-wide text-zinc-400">
                        No img
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium text-zinc-950">
                        {product.name}
                      </p>
                      <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-sky-900 ring-1 ring-inset ring-sky-200">
                        CJ import
                      </span>
                    </div>
                    <p className="text-sm text-zinc-500">
                      {formatMoney(Number(product.price), product.currency)} ·{" "}
                      {product.status} · Supplier stock{" "}
                      {product.stock_quantity}
                    </p>
                  </div>
                </div>
                <Link
                  href={`/vendor/products/${product.id}/edit?catalog=cj`}
                  className="inline-flex rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-sm font-medium text-sky-950 hover:bg-sky-100"
                >
                  Edit CJ listing
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
