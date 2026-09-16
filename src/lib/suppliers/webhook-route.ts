import { NextResponse } from "next/server";
import {
  applySupplierTrackingUpdate,
  normalizeSupplierWebhookPayload,
  verifySupplierWebhookSecret,
} from "@/lib/suppliers/webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Shared factory for provider-specific fulfillment webhooks.
 * Auth: Bearer CRON_SECRET | SUPPLIER_WEBHOOK_SECRET | SUPPLIER_WEBHOOK_SECRET_<PROVIDER>
 */
export function createSupplierWebhookHandler(provider: string) {
  return async function POST(request: Request) {
    if (!verifySupplierWebhookSecret(request, provider)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const normalized = normalizeSupplierWebhookPayload(provider, body);
    const result = await applySupplierTrackingUpdate(normalized);

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error, normalized },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      provider,
      order_id: result.orderId,
      status: result.status,
    });
  };
}
