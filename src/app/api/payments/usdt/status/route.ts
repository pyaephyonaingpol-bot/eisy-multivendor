import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/payments/usdt/status?intent=...
 * Buyer polls pending TRC-20 checkout until confirmed / expired.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const intentId = new URL(request.url).searchParams.get("intent")?.trim();
  if (!intentId) {
    return NextResponse.json(
      { error: "intent query parameter is required." },
      { status: 400 },
    );
  }

  const { data: intent, error } = await supabase
    .from("usdt_payment_intents")
    .select(
      "id, status, amount_usdt, deposit_address, tx_hash, order_ids, expires_at, confirmed_at, network, created_at, updated_at",
    )
    .eq("id", intentId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!intent) {
    return NextResponse.json({ error: "Payment intent not found." }, { status: 404 });
  }

  // RLS should already restrict, but double-check ownership via select result.
  const { data: owned } = await supabase
    .from("usdt_payment_intents")
    .select("user_id")
    .eq("id", intentId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!owned) {
    return NextResponse.json({ error: "Payment intent not found." }, { status: 404 });
  }

  const pendingPayment =
    intent.status === "pending" || intent.status === "detecting";

  return NextResponse.json({
    ok: true,
    payment_status: intent.status,
    pending_payment: pendingPayment,
    intent: {
      id: intent.id,
      status: intent.status,
      amount_usdt: intent.amount_usdt,
      deposit_address: intent.deposit_address,
      tx_hash: intent.tx_hash,
      order_ids: intent.order_ids,
      expires_at: intent.expires_at,
      confirmed_at: intent.confirmed_at,
      network: intent.network,
    },
  });
}
