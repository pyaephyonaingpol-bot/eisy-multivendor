"use client";

type HomeHeroCtasProps = {
  vendorHref: string;
};

const primaryClassName =
  "inline-flex cursor-pointer items-center justify-center rounded-full bg-zinc-950 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950";

const secondaryClassName =
  "inline-flex cursor-pointer items-center justify-center rounded-full border border-zinc-200 bg-white px-5 py-2.5 text-sm font-medium text-zinc-950 transition hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400";

/**
 * Home CTAs use hard navigation so clicks always leave the page even when the
 * App Router soft-nav is waiting on dynamic auth/session work.
 */
export function HomeHeroCtas({ vendorHref }: HomeHeroCtasProps) {
  return (
    <div className="relative z-10 flex flex-wrap gap-3">
      <a
        href="/products"
        className={primaryClassName}
        onClick={(event) => {
          if (
            event.metaKey ||
            event.altKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.button !== 0
          ) {
            return;
          }
          event.preventDefault();
          window.location.assign("/products");
        }}
      >
        Browse products
      </a>
      <a
        href={vendorHref}
        className={secondaryClassName}
        onClick={(event) => {
          if (
            event.metaKey ||
            event.altKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.button !== 0
          ) {
            return;
          }
          event.preventDefault();
          window.location.assign(vendorHref);
        }}
      >
        Become a vendor
      </a>
    </div>
  );
}
