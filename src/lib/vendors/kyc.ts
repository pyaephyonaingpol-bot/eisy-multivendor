import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/types/database";

export const KYC_DOCUMENTS_BUCKET = "kyc-documents";
export const MAX_KYC_DOCUMENT_BYTES = 5 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const ALLOWED_MIME_TYPE_LIST = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

function isFile(value: FormDataEntryValue): value is File {
  return typeof File !== "undefined" && value instanceof File && value.size > 0;
}

export function collectKycDocumentFile(formData: FormData): File | null {
  const value = formData.get("document");
  if (value == null) return null;
  return isFile(value) ? value : null;
}

function isBucketMissingError(message: string | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("bucket not found") ||
    (m.includes("not found") && m.includes("bucket")) ||
    m.includes("the resource was not found")
  );
}

/**
 * Ensure the private `kyc-documents` bucket exists (service role).
 * Prefer applying migration 048 / scripts/ensure_kyc_documents_storage_bucket.sql
 * for RLS policies; this only creates the bucket when missing.
 */
async function ensureKycDocumentsBucket(
  storage: SupabaseClient<Database>["storage"],
): Promise<{ error?: string }> {
  const { data: existing, error: getError } = await storage.getBucket(
    KYC_DOCUMENTS_BUCKET,
  );

  if (existing && !getError) {
    return {};
  }

  const { error: createError } = await storage.createBucket(KYC_DOCUMENTS_BUCKET, {
    public: false,
    fileSizeLimit: MAX_KYC_DOCUMENT_BYTES,
    allowedMimeTypes: [...ALLOWED_MIME_TYPE_LIST],
  });

  if (
    createError &&
    !createError.message.toLowerCase().includes("already exists") &&
    !createError.message.toLowerCase().includes("duplicate")
  ) {
    return {
      error:
        createError.message ||
        "Could not create kyc-documents storage bucket. Run supabase/scripts/ensure_kyc_documents_storage_bucket.sql in the SQL Editor.",
    };
  }

  return {};
}

/** Upload a KYC document into the private kyc-documents bucket. */
export async function uploadVendorKycDocument(
  vendorId: string,
  file: File,
): Promise<{ path?: string; url?: string; error?: string }> {
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return { error: "Document must be JPEG, PNG, WebP, or PDF." };
  }

  if (file.size > MAX_KYC_DOCUMENT_BYTES) {
    return { error: "Document must be 5 MB or smaller." };
  }

  let storage: SupabaseClient<Database>["storage"];
  try {
    storage = createServiceClient().storage;
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Storage is not configured for uploads.",
    };
  }

  const ensured = await ensureKycDocumentsBucket(storage);
  if (ensured.error) {
    return { error: ensured.error };
  }

  const ext = EXT_BY_MIME[file.type] ?? "bin";
  const path = `${vendorId}/kyc/${crypto.randomUUID()}.${ext}`;

  let { error } = await storage.from(KYC_DOCUMENTS_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
    cacheControl: "3600",
  });

  // Race: bucket missing between getBucket and upload — create and retry once.
  if (error && isBucketMissingError(error.message)) {
    const retryEnsure = await ensureKycDocumentsBucket(storage);
    if (retryEnsure.error) {
      return { error: retryEnsure.error };
    }
    ({ error } = await storage.from(KYC_DOCUMENTS_BUCKET).upload(path, file, {
      contentType: file.type,
      upsert: false,
      cacheControl: "3600",
    }));
  }

  if (error) {
    const hint = isBucketMissingError(error.message)
      ? " Run supabase/scripts/ensure_kyc_documents_storage_bucket.sql in the Supabase SQL Editor."
      : "";
    return {
      error: `${error.message || "Could not upload KYC document."}${hint}`,
    };
  }

  // Bucket is private; store a stable path. Admins/owners open via signed URLs.
  const { data } = storage.from(KYC_DOCUMENTS_BUCKET).getPublicUrl(path);
  return { path, url: data.publicUrl };
}

export async function createKycDocumentSignedUrl(
  path: string,
  expiresInSeconds = 60 * 15,
): Promise<{ url?: string; error?: string }> {
  if (!path) {
    return { error: "Document path is missing." };
  }

  let storage: SupabaseClient<Database>["storage"];
  try {
    storage = createServiceClient().storage;
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Storage is not configured for signed URLs.",
    };
  }

  const ensured = await ensureKycDocumentsBucket(storage);
  if (ensured.error) {
    return { error: ensured.error };
  }

  const { data, error } = await storage
    .from(KYC_DOCUMENTS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    return { error: error?.message || "Could not create signed URL." };
  }

  return { url: data.signedUrl };
}
