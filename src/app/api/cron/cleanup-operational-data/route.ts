import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Nightly retention: purge completed fulfillment/wallet jobs, old payment
 * events, and stale fulfillment alerts so operational tables stay lean.
 * Auth: Authorization: Bearer <CRON_SECRET>
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";

  if (!secret || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let jobDays = 30;
  let eventDays = 90;
  let alertDays = 60;
  try {
    const body = (await request.json()) as {
      job_retention_days?: number;
      event_retention_days?: number;
      alert_retention_days?: number;
    };
    if (body.job_retention_days != null) {
      jobDays = Number(body.job_retention_days);
    }
    if (body.event_retention_days != null) {
      eventDays = Number(body.event_retention_days);
    }
    if (body.alert_retention_days != null) {
      alertDays = Number(body.alert_retention_days);
    }
  } catch {
    // empty body is fine — use defaults
  }

  try {
    const supabase = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("cleanup_operational_data", {
      p_job_retention_days: jobDays,
      p_event_retention_days: eventDays,
      p_alert_retention_days: alertDays,
    });

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, result: data });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Operational cleanup failed.",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}
