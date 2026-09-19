import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  confirmUsdtTrc20Payment,
  getUsdtWebhookSecret,
  syncUsdtTrc20SettingsFromEnv,
  USDT_TRC20_CONTRACT_DEFAULT,
  verifyUsdtTrc20TransferByTxId,
} from "@/lib/payments/usdt-trc20";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type VerifyEscrowBody = {
  order_id?: string;
  orderId?: string;
  tx_id?: string;
  txId?: string;
  tx_hash?: string;
};

/**
 * POST /api/verify-escrow
 *
 * Body: { order_id: string, tx_id: string }
 *
 * Verifies a USDT TRC-20 transfer on TronGrid for the order's assigned deposit
 * address and amount. On success, confirms payment and holds escrow
 * (`payout_status = held`, `payment_tx_hash = tx_id`).
 *
 * Auth: signed-in order owner, admin, or Bearer USDT_WEBHOOK_SECRET / CRON_SECRET.
 */
export async function POST(request: Request) {
  let body: VerifyEscrowBody;
  try {
    body = (await request.json()) as VerifyEscrowBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const orderId = String(body.order_id ?? body.orderId ?? "").trim();
  const txId = String(body.tx_id ?? body.txId ?? body.tx_hash ?? "").trim();

  if (!orderId) {
    return NextResponse.json(
      { ok: false, error: "order_id is required." },
      { status: 400 },
    );
  }
  if (!txId) {
    return NextResponse.json(
      { ok: false, error: "tx_id is required." },
      { status: 400 },
    );
  }

  const supabaseUser = await createClient();
  const {
    data: { user },
  } = await supabaseUser.auth.getUser();

  const secret = getUsdtWebhookSecret();
  const authHeader = request.headers.get("authorization") ?? "";
  const bearer = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const serviceAuth = Boolean(secret && bearer && bearer === secret);

  if (!user && !serviceAuth) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const admin = createServiceClient();
  const { data: orderRow, error: orderError } = await admin
    .from("orders")
    .select(
      "id, customer_id, total, currency, payment_status, payout_status, payment_intent_id, payment_tx_hash, vendor_id, seller_vendor_id",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (orderError) {
    return NextResponse.json(
      { ok: false, error: orderError.message },
      { status: 500 },
    );
  }
  if (!orderRow) {
    return NextResponse.json(
      { ok: false, error: "Order not found." },
      { status: 404 },
    );
  }

  const order = orderRow as {
    id: string;
    customer_id: string;
    total: number;
    currency: string;
    payment_status: string;
    payout_status: string;
    payment_intent_id: string | null;
    payment_tx_hash: string | null;
  };

  if (user && !serviceAuth) {
    const { data: profile } = await supabaseUser
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    const isAdmin = (profile as { role?: string } | null)?.role === "admin";
    if (!isAdmin && order.customer_id !== user.id) {
      return NextResponse.json(
        { ok: false, error: "Not allowed to verify this order." },
        { status: 403 },
      );
    }
  }

  // Already escrow-held / paid with this tx.
  if (
    order.payment_status === "paid" &&
    (order.payout_status === "held" || order.payout_status === "disputed") &&
    order.payment_tx_hash &&
    order.payment_tx_hash.toLowerCase() === txId.toLowerCase()
  ) {
    return NextResponse.json({
      ok: true,
      status: "already_confirmed",
      order_id: order.id,
      tx_id: order.payment_tx_hash,
      escrow_status: "escrow_held",
      payout_status: order.payout_status,
    });
  }

  if (!order.payment_intent_id) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Order has no USDT payment intent. Complete TRC-20 checkout before verifying escrow.",
      },
      { status: 400 },
    );
  }

  const { data: intentRow, error: intentError } = await admin
    .from("usdt_payment_intents")
    .select("id, amount_usdt, deposit_address, status, order_ids, tx_hash")
    .eq("id", order.payment_intent_id)
    .maybeSingle();

  if (intentError) {
    return NextResponse.json(
      { ok: false, error: intentError.message },
      { status: 500 },
    );
  }
  if (!intentRow) {
    return NextResponse.json(
      { ok: false, error: "Payment intent not found for this order." },
      { status: 404 },
    );
  }

  const intent = intentRow as {
    id: string;
    amount_usdt: number;
    deposit_address: string;
    status: string;
    order_ids: string[];
    tx_hash: string | null;
  };

  const expectedAmount = Number(intent.amount_usdt) || Number(order.total);
  const depositAddress = intent.deposit_address?.trim();
  if (!depositAddress) {
    return NextResponse.json(
      {
        ok: false,
        error: "Order has no assigned USDT deposit address.",
      },
      { status: 400 },
    );
  }

  try {
    await syncUsdtTrc20SettingsFromEnv();

    const verified = await verifyUsdtTrc20TransferByTxId({
      txId,
      expectedToAddress: depositAddress,
      expectedAmountUsdt: expectedAmount,
    });

    if (
      verified.contractAddress.toLowerCase() !==
      USDT_TRC20_CONTRACT_DEFAULT.toLowerCase()
    ) {
      // Allow configured override, but surface when neither matches default.
      const configured = (
        process.env.USDT_TRC20_CONTRACT_ADDRESS?.trim() ||
        USDT_TRC20_CONTRACT_DEFAULT
      ).toLowerCase();
      if (verified.contractAddress.toLowerCase() !== configured) {
        return NextResponse.json(
          {
            ok: false,
            error: `Token is not USDT TRC-20 (${USDT_TRC20_CONTRACT_DEFAULT}).`,
          },
          { status: 400 },
        );
      }
    }

    const result = await confirmUsdtTrc20Payment({
      paymentIntentId: intent.id,
      txHash: verified.txHash,
      fromAddress: verified.fromAddress,
      toAddress: verified.toAddress,
      amountUsdt: verified.amountUsdt,
      confirmations: verified.confirmations,
      rawPayload: {
        source: "verify_escrow_api",
        order_id: order.id,
        chain: verified.raw,
      },
    });

    return NextResponse.json({
      ok: true,
      status: result.status,
      order_id: order.id,
      tx_id: verified.txHash,
      escrow_status: "escrow_held",
      payout_status: "held",
      total_usdt: expectedAmount,
      deposit_address: depositAddress,
      verified: {
        amount_usdt: verified.amountUsdt,
        to_address: verified.toAddress,
        from_address: verified.fromAddress,
        contract_address: verified.contractAddress,
        confirmed: verified.confirmed,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Escrow verification failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
