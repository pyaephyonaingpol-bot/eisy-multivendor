import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionProfile, canAccessVendor } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function VendorImportExtensionPage() {
  const session = await getSessionProfile();
  if (!session) {
    redirect("/login?next=/vendor/import/extension");
  }
  if (!canAccessVendor(session.role)) {
    redirect("/");
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm text-zinc-500">
          <Link href="/vendor/import" className="underline">
            ← Import catalog
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Dropship browser extension API
        </h1>
        <p className="max-w-2xl text-zinc-600">
          Use these authenticated endpoints from a browser extension or bookmarklet
          while signed in as an approved vendor. Cookies from this site are required.
        </p>
      </div>

      <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold">POST /api/dropship/import</h2>
        <p className="text-sm text-zinc-600">
          One-click import (or re-price) a supplier product into your store.
        </p>
        <pre className="overflow-x-auto rounded-lg bg-zinc-950 p-4 text-xs text-zinc-100">
{`POST /api/dropship/import
Content-Type: application/json

{
  "source_product_id": "<uuid>",
  "price": 42.5,
  "status": "active"
}

// 200
{
  "ok": true,
  "product_id": "<uuid>",
  "source_product_id": "<uuid>",
  "updated": false,
  "price": 42.5,
  "status": "active"
}`}
        </pre>
      </section>

      <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold">GET /api/dropship/catalog</h2>
        <p className="text-sm text-zinc-600">
          List importable active supplier products (excludes your own catalog).
        </p>
        <pre className="overflow-x-auto rounded-lg bg-zinc-950 p-4 text-xs text-zinc-100">
{`GET /api/dropship/catalog?limit=24

// 200
{
  "ok": true,
  "products": [
    {
      "id": "<uuid>",
      "name": "…",
      "price": 10,
      "currency": "USDT",
      "vendor": { "id": "…", "name": "…", "slug": "…" },
      "product_url": "/products/<uuid>"
    }
  ]
}`}
        </pre>
      </section>

      <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Checkout routing</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-700">
          <li>Buyer pays your listing price in USDT.</li>
          <li>
            The fulfillment order is created for the original supplier (
            <code className="rounded bg-zinc-100 px-1">orders.vendor_id</code>
            ).
          </li>
          <li>
            Your store is recorded as the seller (
            <code className="rounded bg-zinc-100 px-1">orders.seller_vendor_id</code>
            ).
          </li>
          <li>Supplier stock is decremented; supplier receives the catalog cost.</li>
          <li>You receive the margin (listing − supplier price) as a wallet credit.</li>
        </ul>
      </section>
    </div>
  );
}
