import { NextResponse } from "next/server";
import {
  confirmUsdtTrc20Payment,
  getUsdtWebhookSecret,
  syncUsdtTrc20SettingsFromEnv,
  verifyUsdtTrc20Transfer,
} from "@/lib/payments/usdt-trc20";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * USDT TRC-20 payment webhook listener.
 * Auth: Authorization: Bearer <USDT_WEBHOOK_SECRET or CRON_SECRET>
 *
 * Body (JSON):
 * {
 *   payment_intent_id: string,
 *   tx_hash: string,
 *   from_address?: string,
 *   to_address?: string,
 *   amount_usdt?: number,
 *   confirmations?: number,
 *   skip_chain_verify?: boolean
 * }
 *
 * On success: marks linked orders Pending → Paid and runs supplier/dropshipper/platform split.
 */
export async function POST(request: Request) {
  const secret = getUsdtWebhookSecret();
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";

  if (!secret || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const paymentIntentId = String(
    body.payment_intent_id ?? body.paymentIntentId ?? "",
  ).trim();
  const txHash = String(body.tx_hash ?? body.txHash ?? "").trim();

  if (!paymentIntentId) {
    return NextResponse.json(
      { error: "payment_intent_id is required." },
      { status: 400 },
    );
  }
  if (!txHash) {
    return NextResponse.json({ error: "tx_hash is required." }, { status: 400 });
  }

  const fromAddress = (body.from_address ?? body.fromAddress ?? null) as
    | string
    | null;
  let toAddress = (body.to_address ?? body.toAddress ?? null) as string | null;
  let amountUsdt =
    body.amount_usdt != null
      ? Number(body.amount_usdt)
      : body.amountUsdt != null
        ? Number(body.amountUsdt)
        : null;
  let confirmations =
    body.confirmations != null ? Number(body.confirmations) : null;
  const skipChainVerify = Boolean(
    body.skip_chain_verify ?? body.skipChainVerify ?? false,
  );

  try {
    const depositAddress = await syncUsdtTrc20SettingsFromEnv();
    if (!toAddress && depositAddress) {
      toAddress = depositAddress;
    }

    let rawPayload: Record<string, unknown> = { ...body, source: "webhook" };

    if (!skipChainVerify && toAddress) {
      try {
        const verified = await verifyUsdtTrc20Transfer({
          txHash,
          expectedToAddress: toAddress,
          expectedAmountUsdt:
            amountUsdt != null && Number.isFinite(amountUsdt)
              ? amountUsdt
              : null,
        });
        amountUsdt = verified.amountUsdt;
        confirmations = verified.confirmations;
        toAddress = verified.toAddress;
        rawPayload = {
          ...rawPayload,
          chain_verified: true,
          chain: verified.raw,
        };

        const result = await confirmUsdtTrc20Payment({
          paymentIntentId,
          txHash: verified.txHash,
          fromAddress: fromAddress ?? verified.fromAddress,
          toAddress: verified.toAddress,
          amountUsdt: verified.amountUsdt,
          confirmations: verified.confirmations,
          rawPayload,
        });
        return NextResponse.json({ ok: true, result, verified: true });
      } catch (verifyError) {
        const message =
          verifyError instanceof Error
            ? verifyError.message
            : "Chain verification failed.";
        if (
          amountUsdt == null ||
          !Number.isFinite(amountUsdt) ||
          !toAddress
        ) {
          return NextResponse.json(
            { ok: false, error: message, stage: "verify" },
            { status: 400 },
          );
        }
        rawPayload = {
          ...rawPayload,
          chain_verified: false,
          chain_verify_error: message,
        };
      }
    }

    const result = await confirmUsdtTrc20Payment({
      paymentIntentId,
      txHash,
      fromAddress,
      toAddress,
      amountUsdt:
        amountUsdt != null && Number.isFinite(amountUsdt) ? amountUsdt : null,
      confirmations:
        confirmations != null && Number.isFinite(confirmations)
          ? confirmations
          : null,
      rawPayload,
    });

    return NextResponse.json({ ok: true, result, verified: false });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "USDT webhook failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
