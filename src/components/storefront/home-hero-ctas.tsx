"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type HomeHeroCtasProps = {
  vendorHref: string;
};

const primaryClassName =
  "inline-flex cursor-pointer items-center justify-center rounded-full bg-zinc-950 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950 disabled:cursor-wait disabled:opacity-70";

const secondaryClassName =
  "inline-flex cursor-pointer items-center justify-center rounded-full border border-zinc-200 bg-white px-5 py-2.5 text-sm font-medium text-zinc-950 transition hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 disabled:cursor-wait disabled:opacity-70";

export function HomeHeroCtas({ vendorHref }: HomeHeroCtasProps) {
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function navigate(href: string) {
    if (isPending) return;
    setPendingHref(href);
    startTransition(() => {
      router.push(href);
    });
    // Soft nav can stall on dynamic routes without an immediate URL change.
    // Fall back to a full navigation so the CTA never feels dead.
    window.setTimeout(() => {
      const path = window.location.pathname;
      if (path === "/" || path === "") {
        window.location.assign(href);
      }
    }, 800);
  }

  return (
    <div className="relative z-10 flex flex-wrap gap-3">
      <Link
        href="/products"
        prefetch
        className={primaryClassName}
        aria-busy={isPending && pendingHref === "/products"}
        onClick={(event) => {
          if (
            event.defaultPrevented ||
            event.button !== 0 ||
            event.metaKey ||
            event.altKey ||
            event.ctrlKey ||
            event.shiftKey
          ) {
            return;
          }
          event.preventDefault();
          navigate("/products");
        }}
      >
        {isPending && pendingHref === "/products" ? "Opening…" : "Browse products"}
      </Link>
      <Link
        href={vendorHref}
        prefetch
        className={secondaryClassName}
        aria-busy={isPending && pendingHref === vendorHref}
        onClick={(event) => {
          if (
            event.defaultPrevented ||
            event.button !== 0 ||
            event.metaKey ||
            event.altKey ||
            event.ctrlKey ||
            event.shiftKey
          ) {
            return;
          }
          event.preventDefault();
          navigate(vendorHref);
        }}
      >
        {isPending && pendingHref === vendorHref ? "Opening…" : "Become a vendor"}
      </Link>
    </div>
  );
}
