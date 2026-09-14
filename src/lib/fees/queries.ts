import { createClient } from "@/lib/supabase/server";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import type {
  DropshipFeeSettings,
  DropshipInventoryFeeInvoice,
  DropshipInventoryFeePreview,
} from "@/lib/types/database";

function mapInvoice(
  row: DropshipInventoryFeeInvoice,
): DropshipInventoryFeeInvoice {
  return {
    ...row,
    active_item_count: Number(row.active_item_count),
    billable_item_count: Number(row.billable_item_count),
    unit_fee_usdt: Number(row.unit_fee_usdt),
    amount_usdt: Number(row.amount_usdt),
  };
}

function mapPreview(data: DropshipInventoryFeePreview): DropshipInventoryFeePreview {
  return {
    ...data,
    active_item_count: Number(data.active_item_count ?? 0),
    billable_item_count: Number(data.billable_item_count ?? 0),
    unit_fee_usdt: Number(data.unit_fee_usdt ?? 1),
    min_billable_items: Number(data.min_billable_items ?? 10),
    commission_rate: Number(data.commission_rate ?? 0.03),
    amount_usdt: Number(data.amount_usdt ?? 0),
  };
}

export async function getDropshipFeeSettings(): Promise<DropshipFeeSettings | null> {
  if (!getSupabasePublicEnv()) {
    return null;
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("dropship_fee_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (!data) {
    return null;
  }

  const row = data as DropshipFeeSettings;
  return {
    ...row,
    item_fee_usdt: Number(row.item_fee_usdt),
    min_billable_items: Number(row.min_billable_items),
    commission_rate: Number(row.commission_rate),
  };
}

export async function previewDropshipInventoryFee(
  vendorId: string,
): Promise<DropshipInventoryFeePreview | null> {
  if (!getSupabasePublicEnv() || !vendorId) {
    return null;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("preview_dropship_inventory_fee", {
    p_vendor_id: vendorId,
  });

  if (error || !data) {
    return null;
  }

  return mapPreview(data as DropshipInventoryFeePreview);
}

export async function listDropshipInventoryFeeInvoices(
  vendorId: string,
  limit = 12,
): Promise<DropshipInventoryFeeInvoice[]> {
  if (!getSupabasePublicEnv() || !vendorId) {
    return [];
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("dropship_inventory_fee_invoices")
    .select("*")
    .eq("vendor_id", vendorId)
    .order("billing_month", { ascending: false })
    .limit(limit);

  return ((data as DropshipInventoryFeeInvoice[] | null) ?? []).map(mapInvoice);
}

export async function listAllDropshipInventoryFeeInvoices(
  limit = 40,
): Promise<(DropshipInventoryFeeInvoice & { vendor_name?: string })[]> {
  if (!getSupabasePublicEnv()) {
    return [];
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("dropship_inventory_fee_invoices")
    .select("*, vendors(name)")
    .order("billing_month", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  return ((data as Array<
    DropshipInventoryFeeInvoice & { vendors?: { name: string } | null }
  > | null) ?? []).map((row) => {
    const { vendors, ...invoice } = row;
    return {
      ...mapInvoice(invoice),
      vendor_name: vendors?.name,
    };
  });
}

export type DropshipCommissionSummary = {
  order_count: number;
  gmv_usdt: number;
  commission_usdt: number;
  commission_rate: number;
};

export async function getVendorDropshipCommissionSummary(
  vendorId: string,
): Promise<DropshipCommissionSummary> {
  const empty: DropshipCommissionSummary = {
    order_count: 0,
    gmv_usdt: 0,
    commission_usdt: 0,
    commission_rate: 0.03,
  };

  if (!getSupabasePublicEnv() || !vendorId) {
    return empty;
  }

  const supabase = await createClient();
  const [ordersResult, settings] = await Promise.all([
    supabase
      .from("orders")
      .select("subtotal, platform_commission_usdt, seller_vendor_id, vendor_id")
      .eq("seller_vendor_id", vendorId)
      .eq("payment_status", "paid"),
    getDropshipFeeSettings(),
  ]);

  const rows =
    (ordersResult.data as
      | {
          subtotal: number;
          platform_commission_usdt: number;
          seller_vendor_id: string;
          vendor_id: string;
        }[]
      | null) ?? [];

  const dropshipOrders = rows.filter(
    (row) =>
      row.seller_vendor_id !== row.vendor_id &&
      Number(row.platform_commission_usdt) > 0,
  );

  return {
    order_count: dropshipOrders.length,
    gmv_usdt: dropshipOrders.reduce((sum, row) => sum + Number(row.subtotal), 0),
    commission_usdt: dropshipOrders.reduce(
      (sum, row) => sum + Number(row.platform_commission_usdt),
      0,
    ),
    commission_rate: settings?.commission_rate ?? 0.03,
  };
}

export async function getPlatformCommissionTotals(): Promise<{
  commission_usdt: number;
  order_count: number;
}> {
  if (!getSupabasePublicEnv()) {
    return { commission_usdt: 0, order_count: 0 };
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select("platform_commission_usdt")
    .gt("platform_commission_usdt", 0)
    .eq("payment_status", "paid");

  const rows =
    (data as { platform_commission_usdt: number }[] | null) ?? [];

  return {
    order_count: rows.length,
    commission_usdt: rows.reduce(
      (sum, row) => sum + Number(row.platform_commission_usdt),
      0,
    ),
  };
}

export async function listDropshipFeeChargeRuns(limit = 12) {
  if (!getSupabasePublicEnv()) {
    return [] as import("@/lib/types/database").DropshipFeeChargeRun[];
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("dropship_fee_charge_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);

  return ((data as import("@/lib/types/database").DropshipFeeChargeRun[] | null) ?? []).map(
    (row) => ({
      ...row,
      paid_count: Number(row.paid_count),
      failed_count: Number(row.failed_count),
      skipped_count: Number(row.skipped_count),
      total_charged_usdt: Number(row.total_charged_usdt),
    }),
  );
}
