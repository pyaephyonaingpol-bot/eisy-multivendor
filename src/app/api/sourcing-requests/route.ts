import { NextResponse } from "next/server";
import {
  canAccessAdmin,
  getSessionProfile,
} from "@/lib/auth/session";
import { submitSourcingRequest } from "@/lib/sourcing-requests/actions";
import {
  listSourcingRequestsForAdmin,
  listSourcingRequestsForBuyer,
} from "@/lib/sourcing-requests/queries";
import type { SourcingRequestStatus } from "@/lib/types/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/sourcing-requests
 * - buyer: own requests
 * - admin: all requests (?status=pending|reviewing|sourced|rejected|closed)
 */
export async function GET(request: Request) {
  const session = await getSessionProfile();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const rawStatus = url.searchParams.get("status");
  const status =
    rawStatus === "pending" ||
    rawStatus === "reviewing" ||
    rawStatus === "sourced" ||
    rawStatus === "rejected" ||
    rawStatus === "closed"
      ? (rawStatus as SourcingRequestStatus)
      : undefined;

  if (canAccessAdmin(session.role)) {
    const requests = await listSourcingRequestsForAdmin({ status });
    return NextResponse.json({ ok: true, requests });
  }

  const requests = await listSourcingRequestsForBuyer(session.userId);
  return NextResponse.json({ ok: true, requests });
}

/**
 * POST /api/sourcing-requests
 * multipart/form-data or JSON:
 *   product_name (required), product_url?, notes?, image? (multipart only)
 */
export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  let formData: FormData;

  try {
    if (contentType.includes("multipart/form-data")) {
      formData = await request.formData();
    } else {
      const body = (await request.json()) as {
        product_name?: string;
        product_url?: string;
        notes?: string;
      };
      formData = new FormData();
      formData.set("product_name", String(body.product_name ?? ""));
      formData.set("product_url", String(body.product_url ?? ""));
      formData.set("notes", String(body.notes ?? ""));
    }
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request body" },
      { status: 400 },
    );
  }

  const result = await submitSourcingRequest(null, formData);
  if (result?.error) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    message: result?.success,
    request_id: result?.requestId ?? null,
    cj_matched: result?.cjMatched ?? false,
  });
}
