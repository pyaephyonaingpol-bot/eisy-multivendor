import { revalidatePath } from "next/cache";
import { canAccessAdmin, getSessionProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  collectKycDocumentFile,
  createKycDocumentSignedUrl,
  uploadVendorKycDocument,
} from "@/lib/vendors/kyc";
import {
  getVendorForOwner,
  listVendorsForKycAdmin,
} from "@/lib/vendors/queries";
import type { Vendor, VendorKycStatus } from "@/lib/types/database";

const KYC_DOC_TYPES = new Set(["passport", "national_id", "trade_license"]);
const KYC_STATUSES = new Set<VendorKycStatus>([
  "unsubmitted",
  "pending",
  "approved",
  "rejected",
]);

export type KycControllerResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number };

function publicKycVendor(vendor: Vendor) {
  return {
    id: vendor.id,
    name: vendor.name,
    slug: vendor.slug,
    status: vendor.status,
    kyc_status: vendor.kyc_status,
    kyc_document_type: vendor.kyc_document_type,
    kyc_legal_name: vendor.kyc_legal_name,
    kyc_document_number: vendor.kyc_document_number,
    kyc_submitted_at: vendor.kyc_submitted_at,
    kyc_reviewed_at: vendor.kyc_reviewed_at,
    kyc_rejection_reason: vendor.kyc_rejection_reason,
    has_document: Boolean(vendor.kyc_document_path),
  };
}

export async function getKycStatus(): Promise<
  KycControllerResult<{ vendor: ReturnType<typeof publicKycVendor> }>
> {
  const session = await getSessionProfile();
  if (!session) {
    return { ok: false, error: "Sign in required.", status: 401 };
  }

  const vendor = await getVendorForOwner(session.userId);
  if (!vendor) {
    return {
      ok: false,
      error: "Create a store application before viewing KYC.",
      status: 404,
    };
  }

  return { ok: true, data: { vendor: publicKycVendor(vendor) } };
}

export async function listKycSubmissions(statusFilter?: string | null): Promise<
  KycControllerResult<{ vendors: ReturnType<typeof publicKycVendor>[] }>
> {
  const session = await getSessionProfile();
  if (!session || !canAccessAdmin(session.role)) {
    return { ok: false, error: "Admin access required.", status: 403 };
  }

  let kycStatus: VendorKycStatus | undefined;
  if (statusFilter) {
    const normalized = statusFilter.trim().toLowerCase() as VendorKycStatus;
    if (!KYC_STATUSES.has(normalized)) {
      return {
        ok: false,
        error: "status must be pending, approved, rejected, or unsubmitted.",
        status: 400,
      };
    }
    kycStatus = normalized;
  }

  const vendors = await listVendorsForKycAdmin(kycStatus);
  return {
    ok: true,
    data: { vendors: vendors.map(publicKycVendor) },
  };
}

export async function submitKycFromFormData(
  formData: FormData,
): Promise<KycControllerResult<{ vendorId: string; kyc_status: string }>> {
  const session = await getSessionProfile();
  if (!session) {
    return { ok: false, error: "Sign in required.", status: 401 };
  }

  const documentType = String(formData.get("document_type") ?? "")
    .trim()
    .toLowerCase();
  const legalName = String(formData.get("legal_name") ?? "").trim();
  const documentNumber = String(formData.get("document_number") ?? "").trim();

  if (!KYC_DOC_TYPES.has(documentType)) {
    return {
      ok: false,
      error: "Choose passport, national_id, or trade_license.",
      status: 400,
    };
  }

  if (!legalName) {
    return { ok: false, error: "Legal name is required.", status: 400 };
  }

  const vendor = await getVendorForOwner(session.userId);
  if (!vendor) {
    return {
      ok: false,
      error: "Create a store application before submitting KYC.",
      status: 404,
    };
  }

  if (vendor.kyc_status === "approved") {
    return { ok: false, error: "KYC is already approved.", status: 400 };
  }

  if (vendor.kyc_status === "pending") {
    return { ok: false, error: "KYC is already pending review.", status: 400 };
  }

  const file = collectKycDocumentFile(formData);
  if (!file) {
    return {
      ok: false,
      error: "Upload a passport, ID card, or trade license document.",
      status: 400,
    };
  }

  const uploaded = await uploadVendorKycDocument(vendor.id, file);
  if (uploaded.error || !uploaded.path) {
    return {
      ok: false,
      error: uploaded.error ?? "Could not upload KYC document.",
      status: 400,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_vendor_kyc", {
    p_document_type: documentType,
    p_document_path: uploaded.path,
    p_document_url: uploaded.url ?? "",
    p_legal_name: legalName,
    p_document_number: documentNumber || null,
  });

  if (error) {
    return { ok: false, error: error.message, status: 400 };
  }

  revalidatePath("/vendor/settings");
  revalidatePath("/vendor/dashboard");
  revalidatePath("/admin/kyc");

  return {
    ok: true,
    data: { vendorId: vendor.id, kyc_status: "pending" },
  };
}

export async function reviewKycSubmission(input: {
  vendorId: string;
  approve: boolean;
  rejectionReason?: string | null;
}): Promise<KycControllerResult<{ vendorId: string; approved: boolean }>> {
  const session = await getSessionProfile();
  if (!session || !canAccessAdmin(session.role)) {
    return { ok: false, error: "Admin access required.", status: 403 };
  }

  const vendorId = input.vendorId.trim();
  if (!/^[0-9a-f-]{36}$/i.test(vendorId)) {
    return { ok: false, error: "Invalid vendor id.", status: 400 };
  }

  if (!input.approve) {
    const reason = (input.rejectionReason ?? "").trim();
    if (!reason) {
      return {
        ok: false,
        error: "Rejection reason is required when rejecting KYC.",
        status: 400,
      };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("review_vendor_kyc", {
    p_vendor_id: vendorId,
    p_approve: input.approve,
    p_rejection_reason: input.approve
      ? null
      : (input.rejectionReason ?? "").trim() || null,
  });

  if (error) {
    return { ok: false, error: error.message, status: 400 };
  }

  revalidatePath("/admin/kyc");
  revalidatePath("/admin/vendors");
  revalidatePath("/vendor/settings");
  revalidatePath("/vendor/dashboard");

  return {
    ok: true,
    data: { vendorId, approved: input.approve },
  };
}

export async function getKycDocumentUrl(
  vendorId: string,
): Promise<KycControllerResult<{ url: string; expiresInSeconds: number }>> {
  const session = await getSessionProfile();
  if (!session) {
    return { ok: false, error: "Sign in required.", status: 401 };
  }

  const isAdmin = canAccessAdmin(session.role);
  const ownVendor = await getVendorForOwner(session.userId);

  if (!isAdmin && ownVendor?.id !== vendorId) {
    return { ok: false, error: "Forbidden.", status: 403 };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vendors")
    .select("kyc_document_path, owner_id")
    .eq("id", vendorId)
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message, status: 400 };
  }

  if (!data?.kyc_document_path) {
    return { ok: false, error: "KYC document not found.", status: 404 };
  }

  if (!isAdmin && data.owner_id !== session.userId) {
    return { ok: false, error: "Forbidden.", status: 403 };
  }

  const expiresInSeconds = 60 * 15;
  const signed = await createKycDocumentSignedUrl(
    data.kyc_document_path,
    expiresInSeconds,
  );
  if (signed.error || !signed.url) {
    return {
      ok: false,
      error: signed.error ?? "Could not create signed URL.",
      status: 400,
    };
  }

  return {
    ok: true,
    data: { url: signed.url, expiresInSeconds },
  };
}
