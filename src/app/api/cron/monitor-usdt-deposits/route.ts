import { NextResponse } from "next/server";
import {
  expireStaleUsdtPaymentIntents,
  monitorPendingUsdtDeposits,
} from "@/lib/payments/usdt-deposit-monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron: poll TronGrid for incoming USDT TRC-20 deposits, match pending
 * payment intents by amount, confirm orders, and expire stale intents.
 * Auth: Authorization: Bearer <CRON_SECRET>
 *
 * Not registered in vercel.json on Hobby (only daily crons allowed; frequent
 * deposit polling needs Pro or an external scheduler hitting this route).
 */
async function handle(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";

  if (!secret || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let lookbackMinutes = 180;
  let limitTransfers = 50;
  try {
    const body = (await request.json()) as {
      lookback_minutes?: number;
      limit?: number;
    };
    if (body.lookback_minutes != null) {
      lookbackMinutes = Math.max(5, Math.min(1440, Number(body.lookback_minutes)));
    }
    if (body.limit != null) {
      limitTransfers = Math.max(1, Math.min(200, Number(body.limit)));
    }
  } catch {
    // empty body ok
  }

  try {
    const expired = await expireStaleUsdtPaymentIntents(100);
    const monitored = await monitorPendingUsdtDeposits({
      lookbackMinutes,
      limitTransfers,
    });

    return NextResponse.json({
      ok: true,
      expired,
      monitored,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "USDT deposit monitor failed.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}
