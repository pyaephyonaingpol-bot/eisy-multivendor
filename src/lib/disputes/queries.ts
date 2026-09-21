import { createClient } from "@/lib/supabase/server";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import type {
  Dispute,
  DisputeStatus,
  FulfillmentChannel,
  Order,
  Profile,
} from "@/lib/types/database";

export {
  DISPUTE_REASON_LABELS,
  DISPUTE_STATUS_LABELS,
} from "@/lib/disputes/labels";

export type DisputeWithRelations = Dispute & {
  order: Pick<
    Order,
    | "id"
    | "status"
    | "payment_status"
    | "payout_status"
    | "total"
    | "currency"
    | "customer_id"
    | "vendor_id"
    | "seller_vendor_id"
    | "fulfillment_channel"
    | "created_at"
  > | null;
  opener: Pick<Profile, "id" | "email" | "full_name"> | null;
};

function normalizeDispute(row: Dispute): Dispute {
  const channel =
    (row as Dispute & { fulfillment_channel?: FulfillmentChannel | null })
      .fulfillment_channel === "cj"
      ? "cj"
      : "manual";
  return { ...row, fulfillment_channel: channel };
}

export async function getOpenDisputeForOrder(
  orderId: string,
): Promise<Dispute | null> {
  if (!getSupabasePublicEnv() || !orderId) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("disputes")
    .select("*")
    .eq("order_id", orderId)
    .in("status", ["open", "under_review"])
    .maybeSingle();
  return (data as Dispute | null) ? normalizeDispute(data as Dispute) : null;
}

export async function listDisputesForBuyer(
  userId: string,
): Promise<Dispute[]> {
  if (!getSupabasePublicEnv()) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("disputes")
    .select("*")
    .eq("opened_by", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  return ((data as Dispute[] | null) ?? []).map(normalizeDispute);
}

export async function listDisputesForAdmin(
  status?: DisputeStatus,
  fulfillmentChannel?: FulfillmentChannel,
): Promise<DisputeWithRelations[]> {
  if (!getSupabasePublicEnv()) return [];
  const supabase = await createClient();
  let query = supabase
    .from("disputes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (status) {
    query = query.eq("status", status);
  }
  if (fulfillmentChannel) {
    query = query.eq("fulfillment_channel", fulfillmentChannel);
  }

  const { data: disputes, error } = await query;
  let rows = ((disputes as Dispute[] | null) ?? []).map(normalizeDispute);

  if (error && /fulfillment_channel/i.test(error.message)) {
    let legacy = supabase
      .from("disputes")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (status) legacy = legacy.eq("status", status);
    const { data } = await legacy;
    rows = ((data as Dispute[] | null) ?? []).map(normalizeDispute);
  } else if (error) {
    console.warn("listDisputesForAdmin:", error.message);
    return [];
  }

  if (rows.length === 0) return [];

  const orderIds = [...new Set(rows.map((d) => d.order_id))];
  const openerIds = [...new Set(rows.map((d) => d.opened_by))];

  const [{ data: orders }, { data: profiles }] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "id, status, payment_status, payout_status, total, currency, customer_id, vendor_id, seller_vendor_id, fulfillment_channel, created_at",
      )
      .in("id", orderIds),
    supabase
      .from("profiles")
      .select("id, email, full_name")
      .in("id", openerIds),
  ]);

  const orderById = new Map(
    ((orders as DisputeWithRelations["order"][] | null) ?? []).map((o) => [
      o!.id,
      o,
    ]),
  );

  // Legacy: derive channel from order when dispute column missing.
  if (fulfillmentChannel) {
    rows = rows.filter((row) => {
      const orderChannel =
        orderById.get(row.order_id)?.fulfillment_channel ??
        row.fulfillment_channel;
      return (orderChannel === "cj" ? "cj" : "manual") === fulfillmentChannel;
    });
  }

  const profileById = new Map(
    ((profiles as Pick<Profile, "id" | "email" | "full_name">[] | null) ?? []).map(
      (p) => [p.id, p],
    ),
  );

  return rows.map((row) => ({
    ...row,
    fulfillment_channel:
      row.fulfillment_channel === "cj" ||
      orderById.get(row.order_id)?.fulfillment_channel === "cj"
        ? "cj"
        : "manual",
    order: orderById.get(row.order_id) ?? null,
    opener: profileById.get(row.opened_by) ?? null,
  }));
}

export async function listManualDisputesForAdmin(
  status?: DisputeStatus,
): Promise<DisputeWithRelations[]> {
  return listDisputesForAdmin(status, "manual");
}

export async function listCjDisputesForAdmin(
  status?: DisputeStatus,
): Promise<DisputeWithRelations[]> {
  return listDisputesForAdmin(status, "cj");
}

export async function countOpenDisputes(
  fulfillmentChannel?: FulfillmentChannel,
): Promise<number> {
  if (!getSupabasePublicEnv()) return 0;
  const supabase = await createClient();
  let query = supabase
    .from("disputes")
    .select("id", { count: "exact", head: true })
    .in("status", ["open", "under_review"]);
  if (fulfillmentChannel) {
    query = query.eq("fulfillment_channel", fulfillmentChannel);
  }
  const { count, error } = await query;
  if (error && /fulfillment_channel/i.test(error.message)) {
    const { count: legacy } = await supabase
      .from("disputes")
      .select("id", { count: "exact", head: true })
      .in("status", ["open", "under_review"]);
    return legacy ?? 0;
  }
  return count ?? 0;
}

