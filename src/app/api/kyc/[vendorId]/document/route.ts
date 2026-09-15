import { getKycDocumentUrl } from "@/lib/api/kyc-controller";
import { jsonError, jsonOk } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/kyc/[vendorId]/document
 * Signed URL for KYC document (owner or admin).
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ vendorId: string }> },
) {
  const { vendorId } = await context.params;
  const result = await getKycDocumentUrl(vendorId);
  if (!result.ok) {
    return jsonError(result.error, result.status);
  }
  return jsonOk(result.data);
}
