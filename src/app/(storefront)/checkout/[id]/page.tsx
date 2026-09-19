import { notFound, redirect } from "next/navigation";
import { CheckoutDepositClient } from "@/components/storefront/checkout-deposit-client";
import { getSessionProfile } from "@/lib/auth/session";
import { getOrderForCustomer } from "@/lib/orders/queries";
import { createClient } from "@/lib/supabase/server";
import type { UsdtPaymentIntent } from "@/lib/types/database";

export const dynamic = "force-dynamic";

/**
 * /checkout/[id] — dynamic USDT TRC-20 deposit page for a specific order.
 * Buyer sends USDT to the assigned address, then confirms via TxID → /api/verify-escrow.
 */
export default async function CheckoutDepositPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSessionProfile();
  const { id } = await params;

  if (!session) {
    redirect(`/login?next=${encodeURIComponent(`/checkout/${id}`)}`);
  }

  const order = await getOrderForCustomer(id, session.userId);
  if (!order) {
    notFound();
  }

  let depositAddress: string | null = null;
  let expiresAt: string | null = null;
  let intentStatus: string | null = null;
  let totalUsdt = Number(order.total);

  if (order.payment_intent_id) {
    const supabase = await createClient();
    const { data: intentRow } = await supabase
      .from("usdt_payment_intents")
      .select("deposit_address, amount_usdt, expires_at, status")
      .eq("id", order.payment_intent_id)
      .maybeSingle();

    const intent = intentRow as Pick<
      UsdtPaymentIntent,
      "deposit_address" | "amount_usdt" | "expires_at" | "status"
    > | null;

    if (intent) {
      depositAddress = intent.deposit_address?.trim() || null;
      expiresAt = intent.expires_at;
      intentStatus = intent.status;
      if (Number.isFinite(Number(intent.amount_usdt))) {
        totalUsdt = Number(intent.amount_usdt);
      }
    }
  }

  return (
    <CheckoutDepositClient
      orderId={order.id}
      currency={order.currency}
      totalUsdt={totalUsdt}
      items={order.items.map((item) => ({
        id: item.id,
        product_name: item.product_name,
        quantity: item.quantity,
        unit_price: Number(item.unit_price),
        total_price: Number(item.total_price),
      }))}
      depositAddress={depositAddress}
      expiresAt={expiresAt}
      paymentStatus={order.payment_status}
      payoutStatus={order.payout_status}
      paymentTxHash={order.payment_tx_hash}
      intentStatus={intentStatus}
    />
  );
}
