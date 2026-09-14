"use client";

import Link from "next/link";
import { useCart } from "@/components/storefront/cart-provider";
import { formatMoney } from "@/lib/money";

export default function CartPage() {
  const { items, itemCount, subtotal, updateQuantity, removeItem, clearCart, openDrawer } =
    useCart();

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Cart</h1>
          <p className="text-sm text-zinc-600">
            {itemCount === 0
              ? "Your cart is empty."
              : `${itemCount} item${itemCount === 1 ? "" : "s"} · settles in USDT`}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={openDrawer}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
          >
            Open cart drawer
          </button>
          {items.length > 0 ? (
            <button
              type="button"
              onClick={clearCart}
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            >
              Clear cart
            </button>
          ) : null}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center">
          <p className="text-sm text-zinc-600">Add products from the shop to get started.</p>
          <Link
            href="/products"
            className="mt-4 inline-flex rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Browse products
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <ul className="space-y-3">
            {items.map((item) => (
              <li
                key={item.productId}
                className="flex flex-wrap items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-4"
              >
                <div className="h-20 w-20 overflow-hidden rounded-xl bg-zinc-100">
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.imageUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <Link
                    href={`/products/${item.productId}`}
                    className="font-medium text-zinc-950 hover:underline"
                  >
                    {item.name}
                  </Link>
                  <p className="text-sm text-zinc-500">
                    {formatMoney(item.price, item.currency)} each
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={1}
                    max={item.maxQuantity ?? undefined}
                    value={item.quantity}
                    onChange={(event) =>
                      updateQuantity(item.productId, Number(event.target.value) || 1)
                    }
                    className="w-16 rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
                  />
                  <p className="w-28 text-right text-sm font-semibold">
                    {formatMoney(item.price * item.quantity, item.currency)}
                  </p>
                  <button
                    type="button"
                    onClick={() => removeItem(item.productId)}
                    className="text-xs text-zinc-500 hover:text-zinc-950"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <aside className="h-fit space-y-4 rounded-2xl border border-zinc-200 bg-white p-5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-600">Subtotal</span>
              <span className="font-semibold">{formatMoney(subtotal, "USDT")}</span>
            </div>
            <p className="text-xs text-zinc-500">
              Marketplace checkout settles exclusively in USDT. MMK cannot be used for
              deposits or checkout.
            </p>
            <Link
              href="/account/wallet"
              className="inline-flex w-full items-center justify-center rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Open USDT wallet
            </Link>
            <Link
              href="/products"
              className="inline-flex w-full items-center justify-center rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            >
              Continue shopping
            </Link>
          </aside>
        </div>
      )}
    </section>
  );
}
