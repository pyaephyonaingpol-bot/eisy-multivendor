"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { useCart } from "@/components/storefront/cart-provider";
import {
  checkoutWithUsdt,
  type CheckoutActionState,
} from "@/lib/cart/checkout-actions";
import { formatMoney, MARKETPLACE_CURRENCY } from "@/lib/money";
import { BUYER_COUNTRY_OPTIONS } from "@/lib/sourcing/constants";

const initialState: CheckoutActionState = null;

const fieldClassName =
  "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-950";

type CheckoutFormProps = {
  isSignedIn: boolean;
  usdtAvailable: number | null;
  defaultCountry?: string;
};

type CjShipCheck = {
  status: "idle" | "checking" | "ok" | "blocked" | "skipped";
  message: string | null;
  methods: Array<{ name: string; amount: number | null; currency: string }>;
};

export function CheckoutForm({
  isSignedIn,
  usdtAvailable,
  defaultCountry = "MM",
}: CheckoutFormProps) {
  const { items, subtotal, itemCount } = useCart();
  const [state, formAction, pending] = useActionState(
    checkoutWithUsdt,
    initialState,
  );
  const [paymentMethod, setPaymentMethod] = useState<"wallet" | "trc20">(
    "wallet",
  );
  const [country, setCountry] = useState(defaultCountry);
  const [cjShip, setCjShip] = useState<CjShipCheck>({
    status: "idle",
    message: null,
    methods: [],
  });

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
    usdtAvailable != null && usdtAvailable < subtotal
      ? subtotal - usdtAvailable
      : 0;
  const walletBlocked = paymentMethod === "wallet" && shortfall > 0;
  const shipBlocked = cjShip.status === "blocked";

  useEffect(() => {
    if (!isSignedIn || items.length === 0) {
      setCjShip({ status: "idle", message: null, methods: [] });
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setCjShip((prev) => ({ ...prev, status: "checking", message: null }));
      try {
        const response = await fetch("/api/shipping/cj-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            country,
            items: items.map((item) => ({
              product_id: item.productId,
              quantity: item.quantity,
            })),
          }),
          signal: controller.signal,
        });
        const data = (await response.json()) as {
          ok?: boolean;
          skipped?: boolean;
          hasCjItems?: boolean;
          error?: string;
          methods?: Array<{
            name: string;
            amount: number | null;
            currency: string;
          }>;
        };

        if (!response.ok || data.ok === false) {
          setCjShip({
            status: "blocked",
            message:
              data.error ??
              "Sorry, CJ Dropshipping does not ship to your location.",
            methods: data.methods ?? [],
          });
          return;
        }

        if (data.skipped || !data.hasCjItems) {
          setCjShip({ status: "skipped", message: null, methods: [] });
          return;
        }

        setCjShip({
          status: "ok",
          message: null,
          methods: data.methods ?? [],
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        setCjShip({
          status: "blocked",
          message:
            error instanceof Error
              ? error.message
              : "Could not verify CJ shipping for this country.",
          methods: [],
        });
      }
    }, 280);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [country, items, isSignedIn]);

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
        <h2 className="text-lg font-semibold tracking-tight">
          Sign in to checkout
        </h2>
        <p className="text-sm text-zinc-600">
          Pay with your USDT wallet or send USDT (TRC-20) on-chain. Sign in to
          continue.
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
      <input type="hidden" name="payment_method" value={paymentMethod} />

      <div className="order-2 space-y-6 lg:order-1">
        <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              Shipping details
            </h2>
            <p className="text-sm text-zinc-500">
              {hasPhysical
                ? "Required for physical items. CJ Dropshipping destinations are verified live before payment."
                : "Optional for digital-only carts."}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <label
                htmlFor="full_name"
                className="text-sm font-medium text-zinc-700"
              >
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
              <label
                htmlFor="phone"
                className="text-sm font-medium text-zinc-700"
              >
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
              <label
                htmlFor="country"
                className="text-sm font-medium text-zinc-700"
              >
                Country
              </label>
              <select
                id="country"
                name="country"
                value={country}
                onChange={(event) => setCountry(event.target.value)}
                className={fieldClassName}
              >
                {BUYER_COUNTRY_OPTIONS.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label
                htmlFor="line1"
                className="text-sm font-medium text-zinc-700"
              >
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
              <label
                htmlFor="line2"
                className="text-sm font-medium text-zinc-700"
              >
                Address line 2
              </label>
              <input id="line2" name="line2" className={fieldClassName} />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="city"
                className="text-sm font-medium text-zinc-700"
              >
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
              <label
                htmlFor="region"
                className="text-sm font-medium text-zinc-700"
              >
                State / region
              </label>
              <input id="region" name="region" className={fieldClassName} />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="postal_code"
                className="text-sm font-medium text-zinc-700"
              >
                Postal code
              </label>
              <input
                id="postal_code"
                name="postal_code"
                className={fieldClassName}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label
                htmlFor="note"
                className="text-sm font-medium text-zinc-700"
              >
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

          {cjShip.status === "checking" ? (
            <p className="rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-sm text-sky-950">
              Checking CJ Dropshipping options for {country}…
            </p>
          ) : null}
          {cjShip.status === "blocked" ? (
            <div
              className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-950"
              role="alert"
            >
              <p className="font-medium">Shipping unavailable</p>
              <p className="mt-1">
                {cjShip.message ??
                  "Sorry, CJ Dropshipping does not ship to your location."}
              </p>
            </div>
          ) : null}
          {cjShip.status === "ok" && cjShip.methods.length > 0 ? (
            <p className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
              CJ shipping available
              {cjShip.methods[0]
                ? ` · ${cjShip.methods[0].name}${
                    cjShip.methods[0].amount != null
                      ? ` (${formatMoney(
                          cjShip.methods[0].amount,
                          cjShip.methods[0].currency || "USD",
                        )})`
                      : ""
                  }`
                : ""}
              {cjShip.methods.length > 1
                ? ` · +${cjShip.methods.length - 1} more`
                : ""}
            </p>
          ) : null}
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
                  <p className="truncate font-medium text-zinc-950">
                    {item.name}
                  </p>
                  <p className="text-zinc-500">
                    {item.quantity} ×{" "}
                    {formatMoney(item.price, MARKETPLACE_CURRENCY)}
                  </p>
                </div>
                <p className="font-medium text-zinc-950">
                  {formatMoney(
                    item.price * item.quantity,
                    MARKETPLACE_CURRENCY,
                  )}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <aside className="order-1 h-fit space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5 lg:sticky lg:top-24 lg:order-2">
        <h2 className="text-lg font-semibold tracking-tight">USDT payment</h2>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-zinc-700">
            Payment method
          </legend>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 px-3 py-2.5 text-sm has-[:checked]:border-zinc-900">
            <input
              type="radio"
              name="payment_method_ui"
              value="wallet"
              checked={paymentMethod === "wallet"}
              onChange={() => setPaymentMethod("wallet")}
              className="mt-1"
            />
            <span>
              <span className="font-medium text-zinc-950">USDT wallet</span>
              <span className="mt-0.5 block text-xs text-zinc-500">
                Instant debit from your marketplace balance.
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 px-3 py-2.5 text-sm has-[:checked]:border-zinc-900">
            <input
              type="radio"
              name="payment_method_ui"
              value="trc20"
              checked={paymentMethod === "trc20"}
              onChange={() => setPaymentMethod("trc20")}
              className="mt-1"
            />
            <span>
              <span className="font-medium text-zinc-950">
                USDT TRC-20 transfer
              </span>
              <span className="mt-0.5 block text-xs text-zinc-500">
                Pay on-chain to a unique deposit address.
              </span>
            </span>
          </label>
        </fieldset>

        <div className="space-y-1 border-t border-zinc-100 pt-3 text-sm">
          <div className="flex justify-between">
            <span className="text-zinc-500">Subtotal</span>
            <span className="font-medium text-zinc-950">
              {formatMoney(subtotal, MARKETPLACE_CURRENCY)}
            </span>
          </div>
          {usdtAvailable != null ? (
            <div className="flex justify-between">
              <span className="text-zinc-500">Wallet available</span>
              <span className="font-medium text-zinc-950">
                {formatMoney(usdtAvailable, MARKETPLACE_CURRENCY)}
              </span>
            </div>
          ) : null}
        </div>

        {walletBlocked ? (
          <p className="text-sm text-amber-800">
            Need {formatMoney(shortfall, MARKETPLACE_CURRENCY)} more in your
            wallet, or switch to TRC-20 transfer.
          </p>
        ) : null}

        {state?.error ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
            {state.error}
          </p>
        ) : null}

        {shipBlocked ? (
          <p className="text-sm text-rose-800">
            Checkout is blocked until you select a country CJ can ship to.
          </p>
        ) : null}

        <button
          type="submit"
          disabled={
            pending ||
            walletBlocked ||
            shipBlocked ||
            cjShip.status === "checking"
          }
          className="w-full rounded-lg bg-zinc-950 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending
            ? "Processing…"
            : shipBlocked
              ? "Shipping unavailable"
              : paymentMethod === "trc20"
                ? "Continue to USDT deposit"
                : "Pay with USDT wallet"}
        </button>
      </aside>
    </form>
  );
}
