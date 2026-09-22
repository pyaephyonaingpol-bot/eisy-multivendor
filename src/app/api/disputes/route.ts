import { NextResponse } from "next/server";
import {
  canAccessAdmin,
  canAccessVendor,
  getSessionProfile,
} from "@/lib/auth/session";
import { openOrderDispute } from "@/lib/disputes/actions";
import {
  listCjDisputesForAdmin,
  listDisputesForAdmin,
  listDisputesForBuyer,
  listManualDisputesForAdmin,
} from "@/lib/disputes/queries";
import type { DisputeReason, DisputeStatus, FulfillmentChannel } from "@/lib/types/database";
import { createClient } from "@/lib/supabase/server";
import { getVendorForOwner } from "@/lib/vendors/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/disputes
 * - admin: optional ?status=&channel=manual|cj
 * - vendor: disputes for their orders, optional ?channel=
 * - buyer: own disputes
 */
export async function GET(request: Request) {
  const session = await getSessionProfile();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const rawStatus = url.searchParams.get("status");
  const status =
    rawStatus === "open" ||
    rawStatus === "under_review" ||
    rawStatus === "resolved_refund" ||
    rawStatus === "resolved_release"
      ? (rawStatus as DisputeStatus)
      : undefined;
  const rawChannel = url.searchParams.get("channel");
  const channel: FulfillmentChannel | undefined =
    rawChannel === "manual" || rawChannel === "cj" ? rawChannel : undefined;

  if (canAccessAdmin(session.role)) {
    const disputes = channel
      ? channel === "cj"
        ? await listCjDisputesForAdmin(status)
        : await listManualDisputesForAdmin(status)
      : await listDisputesForAdmin(status);
    return NextResponse.json({
      ok: true,
      fulfillment_channel: channel ?? "all",
      disputes,
    });
  }

  if (canAccessVendor(session.role)) {
    const vendor = await getVendorForOwner(session.userId);
    if (vendor) {
      const supabase = await createClient();
      let orderQuery = supabase
        .from("orders")
        .select("id")
        .or(`vendor_id.eq.${vendor.id},seller_vendor_id.eq.${vendor.id}`);
      if (channel) {
        orderQuery = orderQuery.eq("fulfillment_channel", channel);
      }
      const { data: orderRows } = await orderQuery;
      const orderIds = ((orderRows as { id: string }[] | null) ?? []).map(
        (row) => row.id,
      );
      if (orderIds.length === 0) {
        return NextResponse.json({
          ok: true,
          fulfillment_channel: channel ?? "all",
          disputes: [],
        });
      }
      let disputeQuery = supabase
        .from("disputes")
        .select("*")
        .in("order_id", orderIds)
        .order("created_at", { ascending: false })
        .limit(100);
      if (status) disputeQuery = disputeQuery.eq("status", status);
      if (channel) {
        disputeQuery = disputeQuery.eq("fulfillment_channel", channel);
      }
      const { data } = await disputeQuery;
      return NextResponse.json({
        ok: true,
        fulfillment_channel: channel ?? "all",
        disputes: data ?? [],
      });
    }
  }

  const disputes = await listDisputesForBuyer(session.userId);
  return NextResponse.json({ ok: true, disputes });
}

/**
 * POST /api/disputes — buyer opens a dispute
 * Body: { order_id, reason, description? }
 */
export async function POST(request: Request) {
  let body: { order_id?: string; reason?: string; description?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const formData = new FormData();
  formData.set("order_id", String(body.order_id ?? ""));
  formData.set("reason", String(body.reason ?? "") as DisputeReason);
  formData.set("description", String(body.description ?? ""));

  const result = await openOrderDispute(null, formData);
  if (result?.error) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, message: result?.success });
}
