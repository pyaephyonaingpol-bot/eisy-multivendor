"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { useCart } from "@/components/storefront/cart-provider";
import { formatMoney, MARKETPLACE_CURRENCY } from "@/lib/money";

export function CheckoutSuccessClient() {
  const params = useSearchParams();
  const { clearCart } = useCart();
  const orderIds = (params.get("orders") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const method = params.get("method") ?? "wallet";
  const intentId = params.get("intent") ?? "";
  const depositAddress = params.get("address") ?? "";
  const amount = params.get("amount") ?? "";
  const expires = params.get("expires") ?? "";

  const isTrc20 = method === "trc20";
  const [txHash, setTxHash] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [intentStatus, setIntentStatus] = useState<string>("pending");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    clearCart();
  }, [clearCart]);

  // Auto-poll pending TRC-20 payment until confirmed/expired (deposit monitor).
  useEffect(() => {
    if (!isTrc20 || !intentId || confirmed) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      try {
        const response = await fetch(
          `/api/payments/usdt/status?intent=${encodeURIComponent(intentId)}`,
          { cache: "no-store" },
        );
        const payload = (await response.json()) as {
          ok?: boolean;
          payment_status?: string;
          pending_payment?: boolean;
          intent?: { status?: string; tx_hash?: string | null };
          error?: string;
        };
        if (cancelled || !response.ok || !payload.ok) {
          timer = setTimeout(poll, 8_000);
          return;
        }

        const status = payload.payment_status ?? payload.intent?.status ?? "";
        setIntentStatus(status);

        if (status === "confirmed") {
          setConfirmed(true);
          setMessage(
            "Payment confirmed on-chain. Orders are now paid and escrow holds are active.",
          );
          return;
        }
        if (status === "expired" || status === "cancelled") {
          setError(
            status === "expired"
              ? "This payment intent expired. Please checkout again."
              : "This payment was cancelled.",
          );
          return;
        }

        if (payload.intent?.tx_hash) {
          setMessage(
            `Detected transfer ${payload.intent.tx_hash.slice(0, 10)}… — confirming.`,
          );
        }
      } catch {
        // keep polling
      }
      if (!cancelled) {
        timer = setTimeout(poll, 6_000);
      }
    }

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [isTrc20, intentId, confirmed]);

  function submitTxHash() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/payments/usdt/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            payment_intent_id: intentId,
            tx_hash: txHash.trim(),
          }),
        });
        const payload = (await response.json()) as {
          ok?: boolean;
          error?: string;
          result?: { status?: string };
        };
        if (!response.ok || !payload.ok) {
          setError(payload.error ?? "Verification failed.");
          return;
        }
        setConfirmed(true);
        setIntentStatus("confirmed");
        setMessage(
          payload.result?.status === "already_confirmed"
            ? "Payment was already confirmed."
            : "Payment confirmed. Orders are now paid and profit split has run.",
        );
      } catch {
        setError("Could not reach the verification endpoint.");
      }
    });
  }

  if (isTrc20 && !confirmed) {
    return (
      <section className="mx-auto max-w-xl space-y-6 rounded-2xl border border-zinc-200 bg-white px-6 py-10 text-center">
        <div className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-wide text-amber-700">
            Pending payment · {intentStatus || "pending"}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Send USDT on TRON
          </h1>
          <p className="text-sm text-zinc-600">
            Orders stay in Pending Payment until the USDT TRC-20 transfer is
            confirmed on-chain. Our deposit monitor matches your payment by
            amount automatically — you can also paste a tx hash below.
          </p>
        </div>

        <div className="space-y-3 rounded-xl bg-zinc-50 px-4 py-4 text-left text-sm">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Amount
            </p>
            <p className="font-semibold text-zinc-950">
              {amount
                ? formatMoney(Number(amount), MARKETPLACE_CURRENCY)
                : "See order total"}{" "}
              · TRC-20
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Deposit address
            </p>
            <p className="break-all font-mono text-zinc-900">
              {depositAddress || "Configured gateway address"}
            </p>
          </div>
          {expires ? (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Expires
              </p>
              <p className="text-zinc-800">{expires}</p>
            </div>
          ) : null}
          {intentId ? (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Payment intent
              </p>
              <p className="break-all font-mono text-zinc-700">{intentId}</p>
            </div>
          ) : null}
        </div>

        {orderIds.length > 0 ? (
          <ul className="space-y-2 rounded-xl border border-zinc-100 px-4 py-3 text-left text-sm">
            {orderIds.map((id) => (
              <li key={id} className="font-mono text-zinc-800">
                <Link
                  href={`/orders/${id}`}
                  className="underline underline-offset-2"
                >
                  {id}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="space-y-2 text-left">
          <label
            htmlFor="tx_hash"
            className="text-sm font-medium text-zinc-700"
          >
            Transaction hash (optional manual verify)
          </label>
          <input
            id="tx_hash"
            value={txHash}
            onChange={(event) => setTxHash(event.target.value)}
            placeholder="Paste TRC-20 tx hash after sending"
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 font-mono text-sm"
          />
          <button
            type="button"
            onClick={submitTxHash}
            disabled={pending || txHash.trim().length < 8 || !intentId}
            className="inline-flex w-full items-center justify-center rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Verifying…" : "Verify payment"}
          </button>
          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}
          {message ? (
            <p className="text-sm text-emerald-700">{message}</p>
          ) : null}
          <p className="text-xs text-zinc-500">
            Listening for deposits… status refreshes every few seconds.
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href="/orders"
            className="inline-flex rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
          >
            View orders
          </Link>
          <Link
            href="/products"
            className="inline-flex rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Continue shopping
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-xl space-y-6 rounded-2xl border border-zinc-200 bg-white px-6 py-10 text-center">
      <div className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-wide text-emerald-700">
          Payment confirmed
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Order placed with USDT
        </h1>
        <p className="text-sm text-zinc-600">
          {isTrc20
            ? "On-chain USDT was confirmed. Vendors and the platform received their profit split into escrow."
            : "Your USDT wallet was debited and vendors received sale credits. Keep these order IDs for your records."}
        </p>
      </div>

      {orderIds.length > 0 ? (
        <ul className="space-y-2 rounded-xl bg-zinc-50 px-4 py-3 text-left text-sm">
          {orderIds.map((id) => (
            <li key={id} className="font-mono text-zinc-800">
              <Link
                href={`/orders/${id}`}
                className="underline underline-offset-2"
              >
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
