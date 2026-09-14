"use client";

import Link from "next/link";
import { useActionState, useMemo } from "react";
import { useCart } from "@/components/storefront/cart-provider";
import {
  checkoutWithUsdt,
  type CheckoutActionState,
} from "@/lib/cart/checkout-actions";
import { formatMoney, MARKETPLACE_CURRENCY } from "@/lib/money";

const initialState: CheckoutActionState = null;

const fieldClassName =
  "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-950";

type CheckoutFormProps = {
  isSignedIn: boolean;
  usdtAvailable: number | null;
};

export function CheckoutForm({ isSignedIn, usdtAvailable }: CheckoutFormProps) {
  const { items, subtotal, itemCount } = useCart();
  const [state, formAction, pending] = useActionState(checkoutWithUsdt, initialState);

  const payload = useMemo(
    () =>
      JSON.stringify(
        items.map((item) => ({
          product_id: item.productId,
          quantity: item.quantity,
        })),
      ),
    [items],
  );

  const hasPhysical = items.some((item) => item.productType === "physical");
  const shortfall =
    usdtAvailable != null && usdtAvailable < subtotal ? subtotal - usdtAvailable : 0;

  if (itemCount === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center">
        <p className="text-sm text-zinc-600">Your cart is empty.</p>
        <Link
          href="/products"
          className="mt-4 inline-flex rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Browse products
        </Link>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="text-lg font-semibold tracking-tight">Sign in to checkout</h2>
        <p className="text-sm text-zinc-600">
          USDT checkout uses your marketplace wallet balance. Sign in to continue.
        </p>
        <p className="text-sm font-medium text-zinc-950">
          Cart total: {formatMoney(subtotal, MARKETPLACE_CURRENCY)}
        </p>
        <Link
          href="/login?next=/checkout"
          className="inline-flex rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Sign in to pay with USDT
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <input type="hidden" name="items" value={payload} />

      <div className="space-y-6">
        <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Shipping details</h2>
            <p className="text-sm text-zinc-500">
              {hasPhysical
                ? "Required for physical items."
                : "Optional for digital-only carts."}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="full_name" className="text-sm font-medium text-zinc-700">
                Full name{hasPhysical ? "" : " (optional)"}
              </label>
              <input
                id="full_name"
                name="full_name"
                required={hasPhysical}
                className={fieldClassName}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="phone" className="text-sm font-medium text-zinc-700">
                Phone{hasPhysical ? "" : " (optional)"}
              </label>
              <input
                id="phone"
                name="phone"
                required={hasPhysical}
                className={fieldClassName}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="country" className="text-sm font-medium text-zinc-700">
                Country
              </label>
              <input
                id="country"
                name="country"
                defaultValue="MM"
                className={fieldClassName}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="line1" className="text-sm font-medium text-zinc-700">
                Address line 1{hasPhysical ? "" : " (optional)"}
              </label>
              <input
                id="line1"
                name="line1"
                required={hasPhysical}
                className={fieldClassName}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="line2" className="text-sm font-medium text-zinc-700">
                Address line 2
              </label>
              <input id="line2" name="line2" className={fieldClassName} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="city" className="text-sm font-medium text-zinc-700">
                City{hasPhysical ? "" : " (optional)"}
              </label>
              <input
                id="city"
                name="city"
                required={hasPhysical}
                className={fieldClassName}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="region" className="text-sm font-medium text-zinc-700">
                State / region
              </label>
              <input id="region" name="region" className={fieldClassName} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="postal_code" className="text-sm font-medium text-zinc-700">
                Postal code
              </label>
              <input id="postal_code" name="postal_code" className={fieldClassName} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="note" className="text-sm font-medium text-zinc-700">
                Order note
              </label>
              <input
                id="note"
                name="note"
                placeholder="Optional delivery instructions"
                className={fieldClassName}
              />
            </div>
          </div>
        </section>

        <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="text-lg font-semibold tracking-tight">Order items</h2>
          <ul className="divide-y divide-zinc-100">
            {items.map((item) => (
              <li
                key={item.productId}
                className="flex items-center justify-between gap-3 py-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-zinc-950">{item.name}</p>
                  <p className="text-zinc-500">
                    {item.quantity} × {formatMoney(item.price, MARKETPLACE_CURRENCY)}
                  </p>
                </div>
                <p className="font-medium text-zinc-950">
                  {formatMoney(item.price * item.quantity, MARKETPLACE_CURRENCY)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <aside className="h-fit space-y-4 rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold tracking-tight">USDT payment</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-zinc-600">Subtotal</span>
            <span className="font-medium">
              {formatMoney(subtotal, MARKETPLACE_CURRENCY)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-600">Wallet available</span>
            <span className="font-medium">
              {usdtAvailable == null
                ? "—"
                : formatMoney(usdtAvailable, MARKETPLACE_CURRENCY)}
            </span>
          </div>
          <div className="flex justify-between border-t border-zinc-100 pt-2 text-base">
            <span className="font-medium">Pay now</span>
            <span className="font-semibold">
              {formatMoney(subtotal, MARKETPLACE_CURRENCY)}
            </span>
          </div>
        </div>

        <p className="text-xs text-zinc-500">
          Confirming payment debits your USDT wallet and credits each vendor. MMK cannot be
          used for checkout.
        </p>

        {shortfall > 0 ? (
          <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <p>
              You need {formatMoney(shortfall, MARKETPLACE_CURRENCY)} more USDT to complete
              this order.
            </p>
            <Link href="/account/wallet" className="font-medium underline">
              Deposit USDT
            </Link>
          </div>
        ) : null}

        {state?.error ? (
          <p className="text-sm text-red-600" role="alert">
            {state.error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending || shortfall > 0}
          className="inline-flex w-full items-center justify-center rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Processing…" : "Pay with USDT wallet"}
        </button>
        <Link
          href="/cart"
          className="inline-flex w-full items-center justify-center rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
        >
          Back to cart
        </Link>
      </aside>
    </form>
  );
}
