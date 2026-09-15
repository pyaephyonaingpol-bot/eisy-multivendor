import { NextResponse } from "next/server";
import {
  confirmUsdtTrc20Payment,
  syncUsdtTrc20SettingsFromEnv,
  verifyUsdtTrc20Transfer,
} from "@/lib/payments/usdt-trc20";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Buyer-facing TRC-20 payment verification.
 * Authenticated buyer submits a tx hash for their pending payment intent;
 * we verify on-chain via TronGrid then confirm orders (Pending → Paid + profit split).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
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

  if (!paymentIntentId || !txHash) {
    return NextResponse.json(
      { error: "payment_intent_id and tx_hash are required." },
      { status: 400 },
    );
  }

  const { data: intent, error: intentError } = await supabase
    .from("usdt_payment_intents")
    .select(
      "id, user_id, amount_usdt, status, deposit_address, expires_at, order_ids",
    )
    .eq("id", paymentIntentId)
    .maybeSingle();

  if (intentError) {
    return NextResponse.json({ error: intentError.message }, { status: 500 });
  }
  if (!intent || intent.user_id !== user.id) {
    return NextResponse.json(
      { error: "Payment intent not found." },
      { status: 404 },
    );
  }
  if (intent.status === "confirmed") {
    return NextResponse.json({
      ok: true,
      result: {
        status: "already_confirmed",
        payment_intent_id: intent.id,
        order_ids: intent.order_ids,
      },
    });
  }
  if (intent.status !== "pending" && intent.status !== "detecting") {
    return NextResponse.json(
      { error: `Payment intent is ${intent.status}.` },
      { status: 400 },
    );
  }

  try {
    await syncUsdtTrc20SettingsFromEnv();
    const verified = await verifyUsdtTrc20Transfer({
      txHash,
      expectedToAddress: intent.deposit_address,
      expectedAmountUsdt: Number(intent.amount_usdt),
    });

    const result = await confirmUsdtTrc20Payment({
      paymentIntentId: intent.id,
      txHash: verified.txHash,
      fromAddress: verified.fromAddress,
      toAddress: verified.toAddress,
      amountUsdt: verified.amountUsdt,
      confirmations: verified.confirmations,
      rawPayload: {
        source: "buyer_verify",
        user_id: user.id,
        chain: verified.raw,
      },
    });

    return NextResponse.json({ ok: true, result, verified: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Payment verification failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
