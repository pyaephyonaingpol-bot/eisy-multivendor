"use client";

import Link from "next/link";
import { formatMoney } from "@/lib/money";
import { useCart } from "@/components/storefront/cart-provider";

export function CartDrawer() {
  const {
    items,
    itemCount,
    subtotal,
    isDrawerOpen,
    closeDrawer,
    updateQuantity,
    removeItem,
  } = useCart();

  if (!isDrawerOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close cart drawer"
        className="absolute inset-0 bg-zinc-950/40"
        onClick={closeDrawer}
      />
      <aside className="relative flex h-full w-full max-w-md flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Your cart</h2>
            <p className="text-sm text-zinc-500">
              {itemCount === 0
                ? "No items yet"
                : `${itemCount} item${itemCount === 1 ? "" : "s"}`}
            </p>
          </div>
          <button
            type="button"
            onClick={closeDrawer}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {items.length === 0 ? (
            <div className="space-y-3 rounded-xl border border-dashed border-zinc-300 px-4 py-10 text-center">
              <p className="text-sm text-zinc-600">Your cart is empty.</p>
              <Link
                href="/products"
                onClick={closeDrawer}
                className="inline-flex rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
              >
                Browse products
              </Link>
            </div>
          ) : (
            <ul className="space-y-4">
              {items.map((item) => {
                const rowKey = `${item.productId}::${item.variantId ?? ""}`;
                return (
                <li
                  key={rowKey}
                  className="flex gap-3 rounded-xl border border-zinc-200 p-3"
                >
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-zinc-100">
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.imageUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/products/${item.productId}`}
                        onClick={closeDrawer}
                        className="truncate text-sm font-medium text-zinc-950 hover:underline"
                      >
                        {item.name}
                      </Link>
                      <button
                        type="button"
                        onClick={() =>
                          removeItem(item.productId, item.variantId)
                        }
                        className="text-xs text-zinc-500 hover:text-zinc-950"
                      >
                        Remove
                      </button>
                    </div>
                    <p className="text-sm text-zinc-600">
                      {formatMoney(item.price, item.currency)}
                    </p>
                    <div className="flex items-center gap-2">
                      <label className="sr-only" htmlFor={`qty-${rowKey}`}>
                        Quantity
                      </label>
                      <input
                        id={`qty-${rowKey}`}
                        type="number"
                        min={1}
                        max={item.maxQuantity ?? undefined}
                        value={item.quantity}
                        onChange={(event) =>
                          updateQuantity(
                            item.productId,
                            Number(event.target.value) || 1,
                            item.variantId,
                          )
                        }
                        className="w-16 rounded-md border border-zinc-200 px-2 py-1 text-sm"
                      />
                      <span className="text-sm font-medium text-zinc-950">
                        {formatMoney(item.price * item.quantity, item.currency)}
                      </span>
                    </div>
                  </div>
                </li>
              );
              })}
            </ul>
          )}
        </div>

        <div className="space-y-3 border-t border-zinc-200 px-4 py-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-600">Subtotal (USDT)</span>
            <span className="font-semibold text-zinc-950">
              {formatMoney(subtotal, "USDT")}
            </span>
          </div>
          <p className="text-xs text-zinc-500">
            Checkout settles in USDT from your wallet balance.
          </p>
          <div className="flex gap-2">
            <Link
              href="/cart"
              onClick={closeDrawer}
              className="inline-flex flex-1 items-center justify-center rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            >
              View cart
            </Link>
            <Link
              href="/checkout"
              onClick={closeDrawer}
              className="inline-flex flex-1 items-center justify-center rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Checkout
            </Link>
          </div>
        </div>
      </aside>
    </div>
  );
}
