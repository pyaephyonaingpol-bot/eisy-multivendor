import { NextResponse } from "next/server";
import { canAccessVendor, getSessionProfile } from "@/lib/auth/session";
import {
  listCjOrdersForVendor,
  listManualOrdersForVendor,
  listOrdersForVendor,
} from "@/lib/orders/queries";
import type { FulfillmentChannel } from "@/lib/types/database";
import { getVendorForOwner } from "@/lib/vendors/queries";

export const dynamic = "force-dynamic";

/**
 * GET /api/vendor/orders?channel=manual|cj
 *
 * Partitioned order list so CJ API fulfillment never mixes with local orders.
 */
export async function GET(request: Request) {
  const session = await getSessionProfile();
  if (!session || !canAccessVendor(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const vendor = await getVendorForOwner(session.userId);
  if (!vendor) {
    return NextResponse.json(
      { error: "Vendor profile required." },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(request.url);
  const raw = String(searchParams.get("channel") ?? "").trim();
  const channel: FulfillmentChannel | undefined =
    raw === "manual" || raw === "cj" ? raw : undefined;

  const orders = channel
    ? channel === "cj"
      ? await listCjOrdersForVendor(vendor.id)
      : await listManualOrdersForVendor(vendor.id)
    : await listOrdersForVendor(vendor.id);

  return NextResponse.json({
    fulfillment_channel: channel ?? "all",
    count: orders.length,
    orders: orders.map((order) => ({
      id: order.id,
      status: order.status,
      payment_status: order.payment_status,
      total: order.total,
      currency: order.currency,
      fulfillment_channel: order.fulfillment_channel,
      tracking_number: order.tracking_number,
      supplier_order_ref: order.supplier_order_ref,
      role: order.role,
      created_at: order.created_at,
    })),
  });
}
