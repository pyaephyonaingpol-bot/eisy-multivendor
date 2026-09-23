"use server";

import { revalidatePath } from "next/cache";
import { getSessionProfile, canAccessAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  getSupabaseConfigError,
  getSupabasePublicEnv,
} from "@/lib/supabase/env";
import { findCjMatchForSourcingRequest } from "@/lib/sourcing-requests/cj-enrichment";
import {
  readSourcingRequestImage,
  uploadSourcingRequestImage,
} from "@/lib/sourcing-requests/images";
import type { SourcingRequestStatus } from "@/lib/types/database";

export type SourcingRequestActionState = {
  error?: string;
  success?: string;
  requestId?: string;
  cjMatched?: boolean;
} | null;

function normalizeOptionalUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export async function submitSourcingRequest(
  _prev: SourcingRequestActionState,
  formData: FormData,
): Promise<SourcingRequestActionState> {
  if (!getSupabasePublicEnv()) {
    return { error: getSupabaseConfigError() };
  }

  const session = await getSessionProfile();
  if (!session) {
    return { error: "Sign in to submit a sourcing request." };
  }

  const productName = String(formData.get("product_name") ?? "").trim();
  const productUrlRaw = String(formData.get("product_url") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (productName.length < 2) {
    return { error: "Product name is required (at least 2 characters)." };
  }
  if (productName.length > 200) {
    return { error: "Product name must be 200 characters or fewer." };
  }
  if (notes && notes.length > 2000) {
    return { error: "Notes must be 2000 characters or fewer." };
  }

  let productUrl: string | null = null;
  if (productUrlRaw) {
    productUrl = normalizeOptionalUrl(productUrlRaw);
    if (!productUrl) {
      return { error: "Product link must be a valid http(s) URL." };
    }
  }

  let imageUrl: string | null = null;
  let imagePath: string | null = null;
  const imageFile = readSourcingRequestImage(formData);
  if (imageFile) {
    const uploaded = await uploadSourcingRequestImage(
      session.userId,
      imageFile,
    );
    if (uploaded.error) {
      return { error: uploaded.error };
    }
    imageUrl = uploaded.url;
    imagePath = uploaded.path;
  }

  // Best-effort CJ catalog match (URL pid or name search). Never blocks submit.
  const cjMatch = await findCjMatchForSourcingRequest({
    productName,
    productUrl,
  });

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("sourcing_requests")
      .insert({
        user_id: session.userId,
        product_name: productName,
        product_url: productUrl,
        image_url: imageUrl,
        image_path: imagePath,
        notes,
        status: "pending" as SourcingRequestStatus,
        cj_external_product_id: cjMatch?.cj_external_product_id ?? null,
        cj_match_title: cjMatch?.cj_match_title ?? null,
        cj_match_image_url: cjMatch?.cj_match_image_url ?? null,
        cj_match_payload: cjMatch?.cj_match_payload ?? null,
      })
      .select("id")
      .single();

    if (error || !data) {
      return {
        error:
          error?.message ??
          "Could not save sourcing request. Ensure the sourcing_requests table is migrated.",
      };
    }

    revalidatePath("/sourcing-request");
    revalidatePath("/admin/sourcing-requests");

    return {
      success: cjMatch
        ? "Request submitted. We found a possible CJ catalog match and saved it for review."
        : "Request submitted. Our team will review and source this product.",
      requestId: data.id,
      cjMatched: Boolean(cjMatch),
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Could not submit sourcing request.",
    };
  }
}

export async function updateSourcingRequestStatus(
  _prev: SourcingRequestActionState,
  formData: FormData,
): Promise<SourcingRequestActionState> {
  if (!getSupabasePublicEnv()) {
    return { error: getSupabaseConfigError() };
  }

  const session = await getSessionProfile();
  if (!session || !canAccessAdmin(session.role)) {
    return { error: "Admin access required." };
  }

  const requestId = String(formData.get("request_id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim() as SourcingRequestStatus;
  const adminNotes = String(formData.get("admin_notes") ?? "").trim() || null;

  const allowed: SourcingRequestStatus[] = [
    "pending",
    "reviewing",
    "sourced",
    "rejected",
    "closed",
  ];
  if (!requestId) return { error: "Missing request id." };
  if (!allowed.includes(status)) return { error: "Invalid status." };

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("sourcing_requests")
      .update({
        status,
        admin_notes: adminNotes,
        reviewed_at: new Date().toISOString(),
        reviewed_by: session.userId,
      })
      .eq("id", requestId);

    if (error) return { error: error.message };

    revalidatePath("/admin/sourcing-requests");
    revalidatePath("/sourcing-request");
    return { success: `Request marked as ${status}.` };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Could not update sourcing request.",
    };
  }
}
