import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth/session";
import { formatMoney } from "@/lib/money";
import { listManualProductsForVendor } from "@/lib/products/queries";
import type { ProductStatus, ProductType } from "@/lib/types/database";
import { getVendorForOwner } from "@/lib/vendors/queries";

export const dynamic = "force-dynamic";

function statusLabel(status: ProductStatus) {
  switch (status) {
    case "active":
      return "Active";
    case "archived":
      return "Archived";
    default:
      return "Draft";
  }
}

function statusClassName(status: ProductStatus) {
  switch (status) {
    case "active":
      return "bg-emerald-50 text-emerald-800 ring-emerald-200";
    case "archived":
      return "bg-zinc-100 text-zinc-600 ring-zinc-200";
    default:
      return "bg-amber-50 text-amber-900 ring-amber-200";
  }
}

function typeLabel(type: ProductType | null | undefined) {
  return type === "digital" ? "Digital" : "Physical";
}

export default async function VendorProductsPage() {
  const session = await getSessionProfile();

  if (!session) {
    redirect("/login?next=/vendor/products");
  }

  const vendor = await getVendorForOwner(session.userId);

  if (!vendor) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Your products</h1>
        <p className="text-zinc-600">
          Submit a vendor application before you can manage a catalog.
        </p>
        <Link
          href="/vendor/apply"
          className="inline-flex rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Apply as a vendor
        </Link>
      </div>
    );
  }

  const products = await listManualProductsForVendor(vendor.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Vendor · Manual catalog
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Your products</h1>
          <p className="max-w-2xl text-zinc-600">
            Manually sourced listings for <strong>{vendor.name}</strong>. CJ
            Dropshipping imports live under Dropshipper → CJ products — they are
            not mixed into this list.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/vendor/dropship/imported"
            className="inline-flex rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-950 hover:bg-sky-100"
          >
            CJ products
          </Link>
          <Link
            href="/vendor/products/new"
            className="inline-flex rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Add product
          </Link>
        </div>
      </div>

      {products.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center">
          <p className="text-zinc-700">No manual products yet.</p>
          <p className="mt-1 text-sm text-zinc-500">
            Add a physical or digital item you source yourself. Import from CJ
            Dropshipping via the Dropshipper workspace.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Link
              href="/vendor/products/new"
              className="inline-flex rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Add product
            </Link>
            <Link
              href="/vendor/sourcing"
              className="inline-flex rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-950 hover:bg-sky-100"
            >
              Browse CJ catalog
            </Link>
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white">
          {products.map((product) => {
            const productType = product.product_type ?? "physical";
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
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-600">
                        Manual
                      </span>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset ${statusClassName(product.status)}`}
                      >
                        {statusLabel(product.status)}
                      </span>
                    </div>
                    <p className="text-sm text-zinc-500">
                      {formatMoney(Number(product.price), product.currency)} ·{" "}
                      {typeLabel(productType)} · Stock{" "}
                      {productType === "digital"
                        ? "∞"
                        : product.stock_quantity}
                    </p>
                  </div>
                </div>
                <Link
                  href={`/vendor/products/${product.id}/edit`}
                  className="inline-flex rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                >
                  Edit
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
