import { NextResponse } from "next/server";
import { canAccessAdmin, getSessionProfile } from "@/lib/auth/session";
import { attachManualPayoutTxHash } from "@/lib/payments/usdt-wallet-jobs";
import { getUsdtWebhookSecret } from "@/lib/payments/usdt-trc20";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/payments/usdt/jobs/complete
 * Attach an on-chain tx hash to a sweep/payout job (manual ops mode / admin).
 *
 * Auth: admin session OR Bearer USDT_WEBHOOK_SECRET / CRON_SECRET
 */
export async function POST(request: Request) {
  const session = await getSessionProfile();
  const isAdmin = session && canAccessAdmin(session.role);

  const secret = getUsdtWebhookSecret();
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const hasSecret = Boolean(secret && token === secret);

  if (!isAdmin && !hasSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { job_id?: string; tx_hash?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const jobId = String(body.job_id ?? "").trim();
  const txHash = String(body.tx_hash ?? "").trim();
  if (!jobId || txHash.length < 8) {
    return NextResponse.json(
      { error: "job_id and tx_hash are required." },
      { status: 400 },
    );
  }

  try {
    const job = await attachManualPayoutTxHash({ jobId, txHash });
    return NextResponse.json({ ok: true, job });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Could not complete job.",
      },
      { status: 400 },
    );
  }
}
