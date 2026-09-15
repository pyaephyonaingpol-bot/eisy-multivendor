"use client";

import { useCart } from "@/components/storefront/cart-provider";

export function CartTrigger() {
  const { itemCount, openDrawer } = useCart();

  return (
    <button
      type="button"
      onClick={openDrawer}
      className="relative inline-flex min-h-9 items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 sm:gap-2 sm:px-3"
      aria-label={`Open cart${itemCount > 0 ? `, ${itemCount} items` : ""}`}
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden
        className="h-4 w-4 shrink-0 sm:hidden"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3.5 5h1.6l1.1 10.2a1.5 1.5 0 0 0 1.5 1.3h9.6a1.5 1.5 0 0 0 1.5-1.2L20 8.5H7"
        />
        <circle cx="9.5" cy="19" r="1.2" fill="currentColor" stroke="none" />
        <circle cx="16.5" cy="19" r="1.2" fill="currentColor" stroke="none" />
      </svg>
      <span className="hidden sm:inline">Cart</span>
      {itemCount > 0 ? (
        <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-zinc-950 px-1.5 text-xs text-white">
          {itemCount > 99 ? "99+" : itemCount}
        </span>
      ) : null}
    </button>
  );
}
