import { NextResponse } from "next/server";
import { processSupplierFulfillmentJobs } from "@/lib/suppliers/fulfillment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron / worker: claim pending supplier fulfillment jobs and create
 * CJ Dropshipping / DSers orders for paid checkouts.
 * Auth: Authorization: Bearer <CRON_SECRET>
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";

  if (!secret || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let limit = 20;
  try {
    const body = (await request.json()) as { limit?: number };
    if (body.limit != null && Number.isFinite(Number(body.limit))) {
      limit = Math.max(1, Math.min(100, Number(body.limit)));
    }
  } catch {
    // empty body is fine
  }

  try {
    const result = await processSupplierFulfillmentJobs(limit);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Supplier fulfillment worker failed.",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}
