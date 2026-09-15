import { createClient } from "@/lib/supabase/server";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import type { SubscriptionPlan } from "@/lib/types/database";

export type VendorImportQuota = {
  vendor_id: string;
  plan: SubscriptionPlan;
  active_item_count: number;
  catalog_item_count: number;
  min_active_items: number;
  max_import_items: number;
  remaining_import_slots: number;
  meets_minimum: boolean;
  at_import_limit: boolean;
  item_fee_usdt: number;
  limit_source: "vendor_override" | "subscription_plan" | "system_default";
  default_max_import_items: number;
};

export type PlanImportLimit = {
  plan: SubscriptionPlan;
  max_import_items: number;
};

function mapQuota(raw: Record<string, unknown>): VendorImportQuota {
  return {
    vendor_id: String(raw.vendor_id),
    plan: (raw.plan as SubscriptionPlan) ?? "free",
    active_item_count: Number(raw.active_item_count ?? 0),
    catalog_item_count: Number(raw.catalog_item_count ?? 0),
    min_active_items: Number(raw.min_active_items ?? 10),
    max_import_items: Number(raw.max_import_items ?? 100),
    remaining_import_slots: Number(raw.remaining_import_slots ?? 0),
    meets_minimum: Boolean(raw.meets_minimum),
    at_import_limit: Boolean(raw.at_import_limit),
    item_fee_usdt: Number(raw.item_fee_usdt ?? 1),
    limit_source:
      (raw.limit_source as VendorImportQuota["limit_source"]) ??
      "system_default",
    default_max_import_items: Number(raw.default_max_import_items ?? 100),
  };
}

export async function getVendorImportQuota(
  vendorId: string,
): Promise<VendorImportQuota | null> {
  if (!getSupabasePublicEnv() || !vendorId) {
    return null;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_vendor_import_quota", {
    p_vendor_id: vendorId,
  });

  if (error || !data) {
    return null;
  }

  return mapQuota(data as Record<string, unknown>);
}

export async function listPlanImportLimits(): Promise<PlanImportLimit[]> {
  if (!getSupabasePublicEnv()) {
    return [];
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("dropship_plan_import_limits")
    .select("plan, max_import_items")
    .order("max_import_items", { ascending: true });

  return ((data as PlanImportLimit[] | null) ?? []).map((row) => ({
    plan: row.plan,
    max_import_items: Number(row.max_import_items),
  }));
}
