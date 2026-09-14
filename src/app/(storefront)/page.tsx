import { HomeHeroCtas } from "@/components/storefront/home-hero-ctas";
import { getSessionProfile } from "@/lib/auth/session";

export default async function HomePage() {
  const session = await getSessionProfile();
  const vendorHref = session ? "/vendor/apply" : "/login?next=/vendor/apply";

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
          stay <code className="rounded bg-zinc-100 px-1.5 py-0.5">pending</code> until an
          admin approves them.
        </p>
        <HomeHeroCtas vendorHref={vendorHref} />
      </div>
    </section>
  );
}
