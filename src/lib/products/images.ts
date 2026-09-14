import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

export const PRODUCT_IMAGES_BUCKET = "product-images";
export const MAX_PRODUCT_IMAGES = 5;
export const MAX_PRODUCT_IMAGE_BYTES = 2 * 1024 * 1024;

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

export function collectImageFiles(formData: FormData): File[] {
  return formData.getAll("images").filter(isFile);
}

export function collectExistingImageUrls(formData: FormData): string[] {
  return formData
    .getAll("existing_image")
    .map((value) => String(value).trim())
    .filter((url) => url.length > 0 && /^https?:\/\//i.test(url));
}

export async function uploadProductImages(
  supabase: SupabaseClient<Database>,
  vendorId: string,
  files: File[],
): Promise<{ urls: string[]; error?: string }> {
  const urls: string[] = [];

  for (const file of files) {
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return {
        urls,
        error: "Images must be JPEG, PNG, WebP, or GIF.",
      };
    }

    if (file.size > MAX_PRODUCT_IMAGE_BYTES) {
      return {
        urls,
        error: "Each image must be 2 MB or smaller.",
      };
    }

    const ext = EXT_BY_MIME[file.type] ?? "bin";
    const path = `${vendorId}/${crypto.randomUUID()}.${ext}`;

    const { error } = await supabase.storage
      .from(PRODUCT_IMAGES_BUCKET)
      .upload(path, file, {
        contentType: file.type,
        upsert: false,
        cacheControl: "3600",
      });

    if (error) {
      return {
        urls,
        error: error.message || "Could not upload product image.",
      };
    }

    const { data } = supabase.storage
      .from(PRODUCT_IMAGES_BUCKET)
      .getPublicUrl(path);

    urls.push(data.publicUrl);
  }

  return { urls };
}

export async function resolveProductImages(
  supabase: SupabaseClient<Database>,
  vendorId: string,
  formData: FormData,
  options?: { maxTotal?: number },
): Promise<{ images: string[]; error?: string }> {
  const maxTotal = options?.maxTotal ?? MAX_PRODUCT_IMAGES;
  const existing = collectExistingImageUrls(formData);
  const files = collectImageFiles(formData);

  if (existing.length + files.length > maxTotal) {
    return {
      images: [],
      error: `You can attach up to ${maxTotal} images per product.`,
    };
  }

  const uploaded = await uploadProductImages(supabase, vendorId, files);
  if (uploaded.error) {
    return { images: [], error: uploaded.error };
  }

  return { images: [...existing, ...uploaded.urls] };
}
