import { NextResponse } from "next/server";
import {
  confirmUsdtTrc20Payment,
  getUsdtWebhookSecret,
  syncUsdtTrc20SettingsFromEnv,
  verifyUsdtTrc20Transfer,
} from "@/lib/payments/usdt-trc20";
import { createServiceClient } from "@/lib/supabase/admin";

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
 *   from_address?: string
 * }
 *
 * Always verifies the transfer on-chain via TronGrid before confirming.
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

  try {
    // Reject legacy skip_chain_verify payloads — confirmation requires TronGrid proof.
    if (body.skip_chain_verify === true || body.skipChainVerify === true) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "skip_chain_verify is not allowed. On-chain verification is required.",
        },
        { status: 400 },
      );
    }

    const depositAddress = await syncUsdtTrc20SettingsFromEnv();
    if (!depositAddress) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "USDT TRC-20 deposit address is not configured (USDT_TRC20_DEPOSIT_ADDRESS).",
        },
        { status: 500 },
      );
    }

    const admin = createServiceClient();
    const { data: intent, error: intentError } = await admin
      .from("usdt_payment_intents")
      .select("id, amount_usdt, deposit_address, status")
      .eq("id", paymentIntentId)
      .maybeSingle();

    if (intentError) {
      return NextResponse.json(
        { ok: false, error: intentError.message },
        { status: 500 },
      );
    }
    if (!intent) {
      return NextResponse.json(
        { ok: false, error: "Payment intent not found." },
        { status: 404 },
      );
    }

    const expectedTo = intent.deposit_address || depositAddress;
    const verified = await verifyUsdtTrc20Transfer({
      txHash,
      expectedToAddress: expectedTo,
      expectedAmountUsdt: Number(intent.amount_usdt),
    });

    const rawPayload: Record<string, unknown> = {
      ...body,
      source: "webhook",
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
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "USDT webhook failed.";
    const status = /not found|less than required|does not match|expired/i.test(
      message,
    )
      ? 400
      : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
