import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Monthly dropship inventory fee billing.
 * Secured by CRON_SECRET (Vercel Cron sends Authorization: Bearer <secret>).
 * Schedule: 01:00 UTC on the 1st of each month (see vercel.json).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";

  if (!secret || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc(
      "charge_all_dropship_inventory_fees",
      {
        p_billing_month: null,
        p_trigger_source: "cron",
        p_note: "Scheduled monthly inventory fee run",
      },
    );

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      result: data,
      ran_at: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Fee cron failed unexpectedly.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
