import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/types/database";

export const SOURCING_REQUEST_IMAGES_BUCKET = "sourcing-request-images";
export const MAX_SOURCING_REQUEST_IMAGE_BYTES = 2 * 1024 * 1024;

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

export function readSourcingRequestImage(formData: FormData): File | null {
  const single = formData.get("image");
  if (single != null && isFile(single)) return single;
  const fromList = formData.getAll("image").find(isFile);
  return fromList ?? null;
}

export async function uploadSourcingRequestImage(
  userId: string,
  file: File,
): Promise<{ url: string | null; path: string | null; error?: string }> {
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return {
      url: null,
      path: null,
      error: "Image must be JPEG, PNG, WebP, or GIF.",
    };
  }
  if (file.size > MAX_SOURCING_REQUEST_IMAGE_BYTES) {
    return {
      url: null,
      path: null,
      error: "Image must be 2 MB or smaller.",
    };
  }

  let storage: SupabaseClient<Database>["storage"];
  try {
    storage = createServiceClient().storage;
  } catch (error) {
    return {
      url: null,
      path: null,
      error:
        error instanceof Error
          ? error.message
          : "Storage is not configured for uploads.",
    };
  }

  const ext = EXT_BY_MIME[file.type] ?? "bin";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await storage
    .from(SOURCING_REQUEST_IMAGES_BUCKET)
    .upload(path, file, {
      contentType: file.type,
      upsert: false,
      cacheControl: "3600",
    });

  if (error) {
    return {
      url: null,
      path: null,
      error: error.message || "Could not upload image.",
    };
  }

  const { data } = storage
    .from(SOURCING_REQUEST_IMAGES_BUCKET)
    .getPublicUrl(path);

  return { url: data.publicUrl, path };
}
