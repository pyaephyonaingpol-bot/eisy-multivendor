"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SubscriptionPlan } from "@/lib/types/database";

export type ImportLimitSettingsState = {
  error?: string;
  success?: string;
} | null;

const PLAN_KEYS: SubscriptionPlan[] = [
  "free",
  "starter",
  "pro",
  "enterprise",
];

export async function updateImportLimitSettingsAction(
  _prev: ImportLimitSettingsState,
  formData: FormData,
): Promise<ImportLimitSettingsState> {
  const defaultMax = Number(
    String(formData.get("default_max_import_items") ?? "").trim(),
  );
  const minActive = Number(
    String(formData.get("min_billable_items") ?? "").trim(),
  );

  if (!Number.isFinite(defaultMax) || defaultMax < 1) {
    return { error: "Default max import items must be a positive number." };
  }
  if (!Number.isFinite(minActive) || minActive < 1) {
    return { error: "Minimum active items must be a positive number." };
  }
  if (defaultMax < minActive) {
    return {
      error: "Default max imports must be at least the minimum active items.",
    };
  }

  const planLimits: Record<string, number> = {};
  for (const plan of PLAN_KEYS) {
    const value = Number(String(formData.get(`plan_${plan}`) ?? "").trim());
    if (!Number.isFinite(value) || value < minActive) {
      return {
        error: `${plan} plan max must be at least ${minActive}.`,
      };
    }
    planLimits[plan] = value;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Sign in as admin." };
  }

  const { error } = await supabase.rpc("admin_update_import_limit_settings", {
    p_default_max_import_items: defaultMax,
    p_min_billable_items: minActive,
    p_plan_limits: planLimits,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/fees");
  revalidatePath("/vendor/integrations");
  revalidatePath("/vendor/import");
  revalidatePath("/vendor/fees");

  return { success: "Import limit settings saved." };
}
