import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/admin";
import { PRODUCT_IMAGES_BUCKET } from "@/lib/products/images";
import type { Database } from "@/lib/types/database";

export const MAX_VENDOR_LOGO_BYTES = 2 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

function isFile(value: FormDataEntryValue): value is File {
  return typeof File !== "undefined" && value instanceof File && value.size > 0;
}

/** Upload a store logo into the shared public product-images bucket. */
export async function uploadVendorLogo(
  vendorId: string,
  file: File,
): Promise<{ url?: string; error?: string }> {
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return { error: "Logo must be JPEG, PNG, WebP, or GIF." };
  }

  if (file.size > MAX_VENDOR_LOGO_BYTES) {
    return { error: "Logo must be 2 MB or smaller." };
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
  const path = `${vendorId}/branding/logo-${crypto.randomUUID()}.${ext}`;

  const { error } = await storage.from(PRODUCT_IMAGES_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
    cacheControl: "3600",
  });

  if (error) {
    return { error: error.message || "Could not upload store logo." };
  }

  const { data } = storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl };
}

export function collectLogoFile(formData: FormData): File | null {
  const value = formData.get("logo");
  if (value == null) return null;
  return isFile(value) ? value : null;
}
