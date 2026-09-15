import {
  getKycStatus,
  listKycSubmissions,
  submitKycFromFormData,
} from "@/lib/api/kyc-controller";
import { jsonError, jsonOk } from "@/lib/api/http";
import { canAccessAdmin, getSessionProfile } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/kyc
 * - Admin: list KYC submissions (?status=pending|approved|rejected)
 * - Vendor: own KYC status
 */
export async function GET(request: Request) {
  const session = await getSessionProfile();
  if (!session) {
    return jsonError("Unauthorized", 401);
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  if (canAccessAdmin(session.role)) {
    const result = await listKycSubmissions(status);
    if (!result.ok) {
      return jsonError(result.error, result.status);
    }
    return jsonOk(result.data);
  }

  const result = await getKycStatus();
  if (!result.ok) {
    return jsonError(result.error, result.status);
  }
  return jsonOk(result.data);
}

/**
 * POST /api/kyc
 * Seller multipart submit: legal_name, document_type, document_number?, document (file)
 */
export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError("Expected multipart form data.", 400);
  }

  const result = await submitKycFromFormData(formData);
  if (!result.ok) {
    return jsonError(result.error, result.status);
  }
  return jsonOk({ ...result.data, message: "KYC submitted for admin review." });
}
