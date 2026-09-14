import { Suspense } from "react";
import { CheckoutSuccessClient } from "@/components/storefront/checkout-success-client";

export default function CheckoutSuccessPage() {
  return (
    <Suspense
      fallback={
        <section className="mx-auto max-w-xl rounded-2xl border border-zinc-200 bg-white px-6 py-10 text-center text-sm text-zinc-500">
          Confirming payment…
        </section>
      }
    >
      <CheckoutSuccessClient />
    </Suspense>
  );
}
