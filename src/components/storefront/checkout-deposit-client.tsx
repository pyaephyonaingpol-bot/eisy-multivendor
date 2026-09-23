"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { formatMoney, MARKETPLACE_CURRENCY } from "@/lib/money";
import { formatDateTime } from "@/lib/datetime";

export type CheckoutDepositItem = {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
};

export type CheckoutDepositClientProps = {
  orderId: string;
  currency: string;
  totalUsdt: number;
  items: CheckoutDepositItem[];
  depositAddress: string | null;
  expiresAt: string | null;
  paymentStatus: string;
  payoutStatus: string;
  paymentTxHash: string | null;
  intentStatus: string | null;
};

type EscrowUiState = "awaiting_payment" | "verifying" | "escrow_held" | "error";

function qrImageUrl(data: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=12&data=${encodeURIComponent(data)}`;
}

function DepositQrCode({ address }: { address: string }) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="mx-auto flex h-[220px] w-[220px] items-center justify-center overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50">
      {failed ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-4 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
            QR placeholder
          </p>
          <p className="break-all font-mono text-[10px] leading-snug text-zinc-500">
            {address}
          </p>
        </div>
      ) : (
        // External QR encoder — next/image not required for this ephemeral asset.
        // eslint-disable-next-line @next/next/no-img-element -- remote QR API, no Image remotePatterns
        <img
          src={qrImageUrl(address)}
          alt="QR code for USDT TRC-20 deposit address"
          width={220}
          height={220}
          className="h-full w-full object-contain"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

export function CheckoutDepositClient({
  orderId,
  currency,
  totalUsdt,
  items,
  depositAddress,
  expiresAt,
  paymentStatus,
  payoutStatus,
  paymentTxHash,
  intentStatus,
}: CheckoutDepositClientProps) {
  const alreadyHeld =
    paymentStatus === "paid" &&
    (payoutStatus === "held" || payoutStatus === "disputed") &&
    Boolean(paymentTxHash);

  const [txId, setTxId] = useState(paymentTxHash ?? "");
  const [copied, setCopied] = useState(false);
  const [escrowStatus, setEscrowStatus] = useState<EscrowUiState>(
    alreadyHeld ? "escrow_held" : "awaiting_payment",
  );
  const [confirmedTxId, setConfirmedTxId] = useState<string | null>(
    alreadyHeld ? paymentTxHash : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function copyAddress() {
    if (!depositAddress) return;
    try {
      await navigator.clipboard.writeText(depositAddress);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy address. Select and copy it manually.");
    }
  }

  function confirmPayment() {
    setError(null);
    const trimmed = txId.trim();
    if (trimmed.length < 8) {
      setError("Enter a valid TRON transaction hash (TxID).");
      return;
    }

    startTransition(async () => {
      setEscrowStatus("verifying");
      try {
        const response = await fetch("/api/verify-escrow", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            order_id: orderId,
            tx_id: trimmed,
          }),
        });
        const payload = (await response.json()) as {
          ok?: boolean;
          error?: string;
          escrow_status?: string;
          tx_id?: string;
          status?: string;
        };

        if (!response.ok || !payload.ok) {
          setEscrowStatus("awaiting_payment");
          setError(payload.error ?? "Verification failed.");
          return;
        }

        setConfirmedTxId(payload.tx_id ?? trimmed);
        setEscrowStatus("escrow_held");
      } catch {
        setEscrowStatus("awaiting_payment");
        setError("Could not reach the verification endpoint.");
      }
    });
  }

  if (escrowStatus === "escrow_held") {
    return (
      <section className="mx-auto max-w-xl space-y-6">
        <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-8 text-center">
          <p className="text-sm font-medium uppercase tracking-wide text-emerald-800">
            escrow_held
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">
            Payment confirmed
          </h1>
          <p className="text-sm text-emerald-900/80">
            Your USDT transfer was verified. Funds are held in escrow until
            delivery is confirmed.
          </p>
          {confirmedTxId ? (
            <p className="break-all font-mono text-xs text-emerald-900/70">
              TxID: {confirmedTxId}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href={`/orders/${orderId}`}
            className="inline-flex rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
          >
            View order
          </Link>
          <Link
            href="/orders"
            className="inline-flex rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
          >
            All orders
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-2">
        <p className="text-sm text-zinc-500">
          <Link href="/orders" className="underline underline-offset-4">
            Orders
          </Link>{" "}
          / Checkout &amp; deposit
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">
          Pay with USDT (TRC-20)
        </h1>
        <p className="text-sm text-zinc-600">
          Send exactly{" "}
          <span className="font-medium text-zinc-950">
            {formatMoney(totalUsdt, currency || MARKETPLACE_CURRENCY)}
          </span>{" "}
          to the deposit address below using TronLink, Binance, or any TRON
          wallet. Then paste your transaction hash to confirm.
        </p>
        {intentStatus ? (
          <p className="text-xs uppercase tracking-wide text-amber-700">
            Intent status: {intentStatus}
          </p>
        ) : null}
      </div>

      <div className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-zinc-950">Order summary</h2>
        <ul className="divide-y divide-zinc-100">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm first:pt-0 last:pb-0"
            >
              <div>
                <p className="font-medium text-zinc-950">{item.product_name}</p>
                <p className="text-zinc-500">Qty {item.quantity}</p>
              </div>
              <p className="font-medium text-zinc-950">
                {formatMoney(
                  Number(item.total_price),
                  currency || MARKETPLACE_CURRENCY,
                )}
              </p>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between border-t border-zinc-200 pt-3">
          <span className="text-sm font-medium text-zinc-700">Total USDT</span>
          <span className="text-lg font-semibold text-zinc-950">
            {formatMoney(totalUsdt, currency || MARKETPLACE_CURRENCY)}
          </span>
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5">
        <div>
          <h2 className="text-lg font-semibold text-zinc-950">
            Deposit address
          </h2>
          <p className="text-sm text-zinc-500">
            Network: TRON · Token: USDT (TRC-20)
          </p>
        </div>

        {depositAddress ? (
          <div className="grid gap-5 sm:grid-cols-[auto_1fr] sm:items-start">
            <DepositQrCode address={depositAddress} />

            <div className="space-y-3">
              <div className="rounded-xl bg-zinc-50 px-3 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Assigned address
                </p>
                <p className="mt-1 break-all font-mono text-sm text-zinc-950">
                  {depositAddress}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void copyAddress()}
                className="inline-flex w-full items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50 sm:w-auto"
              >
                {copied ? "Copied" : "Copy to Clipboard"}
              </button>
              {expiresAt ? (
                <p className="text-xs text-zinc-500">
                  Intent expires {formatDateTime(expiresAt)}
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            No TRC-20 deposit address is assigned to this order yet. Complete
            USDT (TRC-20) checkout first, or contact support if payment is
            pending.
          </p>
        )}
      </div>

      <div className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5">
        <div>
          <h2 className="text-lg font-semibold text-zinc-950">
            Confirm payment
          </h2>
          <p className="text-sm text-zinc-500">
            After sending USDT, paste the Transaction Hash (TxID) from your
            wallet.
          </p>
        </div>
        <div className="space-y-2">
          <label
            htmlFor="tx_id"
            className="text-sm font-medium text-zinc-700"
          >
            Transaction Hash (TxID)
          </label>
          <input
            id="tx_id"
            value={txId}
            onChange={(event) => setTxId(event.target.value)}
            placeholder="Paste TRON transaction hash"
            autoComplete="off"
            spellCheck={false}
            disabled={!depositAddress || pending}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2.5 font-mono text-sm text-zinc-950 disabled:bg-zinc-50 disabled:opacity-60"
          />
        </div>
        <button
          type="button"
          onClick={confirmPayment}
          disabled={
            pending ||
            !depositAddress ||
            txId.trim().length < 8 ||
            escrowStatus === "verifying"
          }
          className="inline-flex w-full items-center justify-center rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending || escrowStatus === "verifying"
            ? "Verifying…"
            : "Confirm Payment"}
        </button>
        {error ? (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
