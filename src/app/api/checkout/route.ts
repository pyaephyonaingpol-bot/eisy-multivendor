import { createCheckout, type CheckoutRequestBody } from "@/lib/api/checkout-controller";
import { jsonError, jsonOk, statusFromMessage } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/checkout
 * Create orders and hold funds in escrow on USDT wallet payment
 * (or create a TRC-20 payment intent — escrow holds on confirmation).
 *
 * Body: { items: [{ product_id, quantity }], payment_method?: "wallet"|"trc20", shipping_address? }
 */
export async function POST(request: Request) {
  let body: CheckoutRequestBody;
  try {
    body = (await request.json()) as CheckoutRequestBody;
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  const result = await createCheckout(body);
  if (!result.ok) {
    return jsonError(
      result.error,
      statusFromMessage(result.error) || result.status,
    );
  }

  return jsonOk(result.data, { status: 201 });
}
