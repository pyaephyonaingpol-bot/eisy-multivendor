import { NextResponse } from "next/server";
import { canAccessAdmin, getSessionProfile } from "@/lib/auth/session";
import {
  resolveDisputeRefund,
  resolveDisputeRelease,
  openOrderDispute,
} from "@/lib/disputes/actions";
import { listDisputesForAdmin, listDisputesForBuyer } from "@/lib/disputes/queries";
import type { DisputeReason } from "@/lib/types/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/disputes — admin: all (optional ?status=); buyer: own
 */
export async function GET(request: Request) {
  const session = await getSessionProfile();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const status = new URL(request.url).searchParams.get("status");

  if (canAccessAdmin(session.role)) {
    const disputes = await listDisputesForAdmin(
      status === "open" ||
        status === "under_review" ||
        status === "resolved_refund" ||
        status === "resolved_release"
        ? status
        : undefined,
    );
    return NextResponse.json({ ok: true, disputes });
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
