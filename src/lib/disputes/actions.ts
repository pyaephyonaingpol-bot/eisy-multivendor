"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { DisputeReason } from "@/lib/types/database";

export type DisputeActionState = {
  error?: string;
  success?: string;
} | null;

const REASONS: DisputeReason[] = [
  "not_received",
  "damaged",
  "not_as_described",
  "wrong_item",
  "other",
];

export async function openOrderDispute(
  _prev: DisputeActionState,
  formData: FormData,
): Promise<DisputeActionState> {
  const orderId = String(formData.get("order_id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim() as DisputeReason;
  const description = String(formData.get("description") ?? "").trim();

  if (!orderId) {
    return { error: "Order id is required." };
  }
  if (!REASONS.includes(reason)) {
    return { error: "Choose a valid dispute reason." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Sign in to open a dispute." };
  }

  const { error } = await supabase.rpc("open_order_dispute", {
    p_order_id: orderId,
    p_reason: reason,
    p_description: description || null,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/admin/disputes");
  revalidatePath("/admin/dashboard");
  revalidatePath("/vendor/wallet");
  revalidatePath("/account/wallet");

  return {
    success:
      "Dispute opened. Escrow release is paused until an admin resolves the case.",
  };
}

export async function resolveDisputeRefund(
  disputeId: string,
  note?: string | null,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in required." };

  const { error } = await supabase.rpc("resolve_dispute_refund_buyer", {
    p_dispute_id: disputeId,
    p_note: note?.trim() || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/disputes");
  revalidatePath("/admin/dashboard");
  revalidatePath("/orders");
  revalidatePath("/account/wallet");
  revalidatePath("/vendor/wallet");
  return {};
}

export async function resolveDisputeRelease(
  disputeId: string,
  note?: string | null,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in required." };

  const { error } = await supabase.rpc("resolve_dispute_release_seller", {
    p_dispute_id: disputeId,
    p_note: note?.trim() || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/disputes");
  revalidatePath("/admin/dashboard");
  revalidatePath("/orders");
  revalidatePath("/account/wallet");
  revalidatePath("/vendor/wallet");
  return {};
}

export async function markDisputeUnderReview(
  disputeId: string,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_dispute_under_review", {
    p_dispute_id: disputeId,
  });
  if (error) return { error: error.message };
  revalidatePath("/admin/disputes");
  return {};
}

export async function setProfileRole(
  userId: string,
  role: "customer" | "vendor" | "admin",
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_profile_role", {
    p_user_id: userId,
    p_role: role,
  });
  if (error) return { error: error.message };
  revalidatePath("/admin/users");
  revalidatePath("/admin/dashboard");
  return {};
}
