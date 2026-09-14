import { NextResponse } from "next/server";
import { buildSupplierFulfillmentRpcArgs } from "@/lib/orders/fulfillment-sync";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Supplier auto-fulfillment webhook / worker entrypoint.
 * Auth: Authorization: Bearer <CRON_SECRET> (or SUPABASE_SERVICE_ROLE usage via admin client).
 * Accepts supplier status + tracking and writes order updates through sync_order_fulfillment.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
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

  const orderId = String(body.order_id ?? body.orderId ?? "").trim();
  if (!orderId) {
    return NextResponse.json(
      { error: "order_id is required." },
      { status: 400 },
    );
  }

  const args = buildSupplierFulfillmentRpcArgs({
    orderId,
    supplierOrderRef: (body.supplier_order_ref ??
      body.supplierOrderRef ??
      null) as string | null,
    supplierStatus: (body.status ?? body.supplier_status ?? null) as
      | string
      | null,
    trackingNumber: (body.tracking_number ?? body.trackingNumber ?? null) as
      | string
      | null,
    trackingCarrier: (body.tracking_carrier ?? body.trackingCarrier ?? null) as
      | string
      | null,
    trackingUrl: (body.tracking_url ?? body.trackingUrl ?? null) as
      | string
      | null,
    source:
      body.source === "supplier_poll" ? "supplier_poll" : "supplier_webhook",
    payload: body,
  });

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc(
      "sync_order_fulfillment",
      args,
    );

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, order: data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Fulfillment sync failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
