import { reviewKycSubmission } from "@/lib/api/kyc-controller";
import { jsonError, jsonOk } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReviewBody = {
  approve?: boolean;
  decision?: "approve" | "reject" | string;
  rejection_reason?: string | null;
  reason?: string | null;
};

/**
 * POST /api/kyc/[vendorId]/review
 * Admin approve/reject KYC.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ vendorId: string }> },
) {
  const { vendorId } = await context.params;

  let body: ReviewBody;
  try {
    body = (await request.json()) as ReviewBody;
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  let approve: boolean | null = null;
  if (typeof body.approve === "boolean") {
    approve = body.approve;
  } else {
    const decision = String(body.decision ?? "")
      .trim()
      .toLowerCase();
    if (decision === "approve") approve = true;
    if (decision === "reject") approve = false;
  }

  if (approve === null) {
    return jsonError(
      'Provide approve: true|false or decision: "approve"|"reject".',
      400,
    );
  }

  const rejectionReason = body.rejection_reason ?? body.reason ?? null;

  const result = await reviewKycSubmission({
    vendorId,
    approve,
    rejectionReason,
  });

  if (!result.ok) {
    return jsonError(result.error, result.status);
  }

  return jsonOk({
    ...result.data,
    message: approve ? "KYC approved." : "KYC rejected.",
  });
}
