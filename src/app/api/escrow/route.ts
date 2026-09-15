import { getEscrowForOrder, releaseEscrowOnDelivery } from "@/lib/api/escrow-controller";
import { jsonError, jsonOk, statusFromMessage } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/escrow?order_id=...
 * Escrow hold / payout status for an order.
 */
export async function GET(request: Request) {
  const orderId = new URL(request.url).searchParams.get("order_id")?.trim();
  if (!orderId) {
    return jsonError("order_id is required.", 400);
  }

  const result = await getEscrowForOrder(orderId);
  if (!result.ok) {
    return jsonError(result.error, result.status);
  }
  return jsonOk(result.data);
}

/**
 * POST /api/escrow
 * Buyer confirms delivery → releases escrowed payouts.
 * Body: { order_id, action?: "release" | "confirm_delivery" }
 */
export async function POST(request: Request) {
  let body: { order_id?: string; action?: string };
  try {
    body = (await request.json()) as { order_id?: string; action?: string };
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  const orderId = String(body.order_id ?? "").trim();
  if (!orderId) {
    return jsonError("order_id is required.", 400);
  }

  const action = String(body.action ?? "release")
    .trim()
    .toLowerCase();
  if (
    action &&
    !["release", "confirm_delivery", "confirm"].includes(action)
  ) {
    return jsonError(
      'action must be "release" or "confirm_delivery".',
      400,
    );
  }

  const result = await releaseEscrowOnDelivery(orderId);
  if (!result.ok) {
    return jsonError(
      result.error,
      statusFromMessage(result.error) || result.status,
    );
  }
  return jsonOk(result.data);
}
