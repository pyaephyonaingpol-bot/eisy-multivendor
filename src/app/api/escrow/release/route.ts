import { releaseEscrowOnDelivery } from "@/lib/api/escrow-controller";
import { jsonError, jsonOk, statusFromMessage } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/escrow/release
 * Explicit release path (buyer delivery confirmation).
 */
export async function POST(request: Request) {
  let body: { order_id?: string };
  try {
    body = (await request.json()) as { order_id?: string };
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  const orderId = String(body.order_id ?? "").trim();
  if (!orderId) {
    return jsonError("order_id is required.", 400);
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
