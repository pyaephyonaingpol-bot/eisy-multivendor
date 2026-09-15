import { NextResponse } from "next/server";
import { canAccessAdmin, getSessionProfile } from "@/lib/auth/session";
import {
  resolveDisputeRefund,
  resolveDisputeRelease,
} from "@/lib/disputes/actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/disputes/[id]/resolve
 * Admin: { action: "refund" | "release", note? }
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSessionProfile();
  if (!session || !canAccessAdmin(session.role)) {
    return NextResponse.json({ ok: false, error: "Admin required" }, { status: 403 });
  }

  const { id } = await context.params;
  let body: { action?: string; note?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const action = String(body.action ?? "").trim().toLowerCase();
  const note = body.note ?? null;

  const result =
    action === "refund"
      ? await resolveDisputeRefund(id, note)
      : action === "release"
        ? await resolveDisputeRelease(id, note)
        : { error: 'action must be "refund" or "release"' };

  if (result.error) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    dispute_id: id,
    action,
  });
}
