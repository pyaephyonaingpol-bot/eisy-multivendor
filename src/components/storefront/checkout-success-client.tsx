"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { useCart } from "@/components/storefront/cart-provider";

export function CheckoutSuccessClient() {
  const params = useSearchParams();
  const { clearCart } = useCart();
  const orderIds = (params.get("orders") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  useEffect(() => {
    clearCart();
  }, [clearCart]);

  return (
    <section className="mx-auto max-w-xl space-y-6 rounded-2xl border border-zinc-200 bg-white px-6 py-10 text-center">
      <div className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-wide text-emerald-700">
          Payment confirmed
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Order placed with USDT</h1>
        <p className="text-sm text-zinc-600">
          Your USDT wallet was debited and vendors received sale credits. Keep these order IDs
          for your records.
        </p>
      </div>

      {orderIds.length > 0 ? (
        <ul className="space-y-2 rounded-xl bg-zinc-50 px-4 py-3 text-left text-sm">
          {orderIds.map((id) => (
            <li key={id} className="font-mono text-zinc-800">
              <Link href={`/orders/${id}`} className="underline underline-offset-2">
                {id}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap justify-center gap-3">
        <Link
          href="/products"
          className="inline-flex rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Continue shopping
        </Link>
        <Link
          href="/orders"
          className="inline-flex rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
        >
          View orders
        </Link>
        <Link
          href="/account/wallet"
          className="inline-flex rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
        >
          View USDT wallet
        </Link>
      </div>
    </section>
  );
}
