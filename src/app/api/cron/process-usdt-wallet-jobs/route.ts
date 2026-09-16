import { NextResponse } from "next/server";
import { processUsdtWalletJobs } from "@/lib/payments/usdt-wallet-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron: process queued USDT sweep + withdrawal payout jobs.
 * Auth: Authorization: Bearer <CRON_SECRET>
 *
 * Mode via USDT_WALLET_OPS_MODE=mock|manual|live
 *
 * Keep vercel.json on Hobby-compatible daily schedules, or invoke this route
 * from an external scheduler / Pro plan for more frequent runs.
 */
async function handle(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";

  if (!secret || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let limit = 10;
  let kind: "sweep" | "withdrawal_payout" | null = null;
  try {
    const body = (await request.json()) as {
      limit?: number;
      kind?: string;
    };
    if (body.limit != null) {
      limit = Math.max(1, Math.min(50, Number(body.limit)));
    }
    if (body.kind === "sweep" || body.kind === "withdrawal_payout") {
      kind = body.kind;
    }
  } catch {
    // empty body ok
  }

  try {
    const result = await processUsdtWalletJobs({ limit, kind });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "USDT wallet job worker failed.",
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
