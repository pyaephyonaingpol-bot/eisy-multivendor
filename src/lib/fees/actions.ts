"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ChargeFeeState = {
  error?: string;
  success?: string;
} | null;

export async function chargeVendorInventoryFeeAction(
  _prev: ChargeFeeState,
  formData: FormData,
): Promise<ChargeFeeState> {
  const vendorId = String(formData.get("vendor_id") ?? "").trim();
  if (!vendorId) {
    return { error: "Vendor is required." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Sign in to pay inventory fees." };
  }

  const { data, error } = await supabase.rpc("charge_dropship_inventory_fee", {
    p_vendor_id: vendorId,
  });

  if (error) {
    return { error: error.message };
  }

  const result = data as {
    status?: string;
    amount_usdt?: number;
    message?: string;
  } | null;

  revalidatePath("/vendor/fees");
  revalidatePath("/vendor/dashboard");
  revalidatePath("/vendor/wallet");
  revalidatePath("/admin/fees");

  if (result?.status === "paid") {
    return {
      success: `Paid ${Number(result.amount_usdt ?? 0).toFixed(2)} USDT inventory fee.`,
    };
  }

  return {
    success: result?.message ?? "Inventory fee updated.",
  };
}

export async function chargeAllInventoryFeesAction(
  _prev: ChargeFeeState,
  formData: FormData,
): Promise<ChargeFeeState> {
  void formData;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Sign in as admin." };
  }

  const { data, error } = await supabase.rpc(
    "charge_all_dropship_inventory_fees",
    {
      p_billing_month: null,
      p_trigger_source: "admin",
      p_note: "Admin manual inventory fee run",
    },
  );

  if (error) {
    return { error: error.message };
  }

  const result = data as {
    paid?: number;
    failed?: number;
    skipped?: number;
    billing_month?: string;
  } | null;

  revalidatePath("/admin/fees");
  revalidatePath("/vendor/fees");
  revalidatePath("/vendor/wallet");

  return {
    success: `Billing ${result?.billing_month ?? "current month"}: ${result?.paid ?? 0} paid, ${result?.failed ?? 0} failed, ${result?.skipped ?? 0} skipped.`,
  };
}
