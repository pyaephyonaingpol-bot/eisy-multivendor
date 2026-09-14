"use client";

import { useCart } from "@/components/storefront/cart-provider";

export function CartTrigger() {
  const { itemCount, openDrawer } = useCart();

  return (
    <button
      type="button"
      onClick={openDrawer}
      className="relative inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
      aria-label={`Open cart${itemCount > 0 ? `, ${itemCount} items` : ""}`}
    >
      Cart
      {itemCount > 0 ? (
        <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-zinc-950 px-1.5 text-xs text-white">
          {itemCount > 99 ? "99+" : itemCount}
        </span>
      ) : null}
    </button>
  );
}
