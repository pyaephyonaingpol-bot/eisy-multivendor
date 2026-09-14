import Link from "next/link";

const primaryClassName =
  "inline-flex cursor-pointer items-center justify-center rounded-full bg-zinc-950 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950";

const secondaryClassName =
  "inline-flex cursor-pointer items-center justify-center rounded-full border border-zinc-200 bg-white px-5 py-2.5 text-sm font-medium text-zinc-950 transition hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400";

/** Vendor onboarding route — unauthenticated users are redirected to login by proxy. */
export const VENDOR_APPLY_HREF = "/vendor/apply";

export function HomeHeroCtas() {
  return (
    <div className="relative z-10 flex flex-wrap gap-3">
      <Link href="/products" className={primaryClassName}>
        Browse products
      </Link>
      <Link href={VENDOR_APPLY_HREF} className={secondaryClassName}>
        Become a vendor
      </Link>
    </div>
  );
}
