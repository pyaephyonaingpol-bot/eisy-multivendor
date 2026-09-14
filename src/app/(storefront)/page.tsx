import Link from "next/link";

export default function HomePage() {
  return (
    <section className="space-y-8">
      <div className="max-w-2xl space-y-4">
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Multi-vendor marketplace
        </p>
        <h1 className="text-4xl font-semibold tracking-tight">
          Shop from independent vendors in one place
        </h1>
        <p className="text-lg text-zinc-600">
          Customers can shop immediately. Sellers apply at /vendor/apply — stores
          stay <code className="rounded bg-zinc-100 px-1.5 py-0.5">pending</code> until an admin approves them.
        </p>
        <div className="flex gap-3">
          <Link
            href="/products"
            className="rounded-full bg-zinc-950 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Browse products
          </Link>
          <Link
            href="/vendor/apply"
            className="rounded-full border border-zinc-200 px-5 py-2.5 text-sm font-medium hover:bg-zinc-50"
          >
            Become a vendor
          </Link>
        </div>
      </div>
    </section>
  );
}
