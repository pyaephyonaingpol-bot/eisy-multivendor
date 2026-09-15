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

  const ext = EXT_BY_MIME[file.type] ?? "bin";
  const path = `${vendorId}/kyc/${crypto.randomUUID()}.${ext}`;

  const { error } = await storage.from(KYC_DOCUMENTS_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
    cacheControl: "3600",
  });

  if (error) {
    return { error: error.message || "Could not upload KYC document." };
  }

  // Bucket is private; store a stable path and a public-style URL for reference.
  // Admins/owners should open documents via signed URLs.
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

  const { data, error } = await storage
    .from(KYC_DOCUMENTS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    return { error: error?.message || "Could not create signed URL." };
  }

  return { url: data.signedUrl };
}
