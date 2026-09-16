import { createClient } from "@/lib/supabase/server";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import type {
  Dispute,
  DisputeStatus,
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
    | "created_at"
  > | null;
  opener: Pick<Profile, "id" | "email" | "full_name"> | null;
};

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
  return (data as Dispute | null) ?? null;
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
    .order("created_at", { ascending: false });
  return (data as Dispute[] | null) ?? [];
}

export async function listDisputesForAdmin(
  status?: DisputeStatus,
): Promise<DisputeWithRelations[]> {
  if (!getSupabasePublicEnv()) return [];
  const supabase = await createClient();
  let query = supabase
    .from("disputes")
    .select("*")
    .order("created_at", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  }

  const { data: disputes } = await query;
  const rows = (disputes as Dispute[] | null) ?? [];
  if (rows.length === 0) return [];

  const orderIds = [...new Set(rows.map((d) => d.order_id))];
  const openerIds = [...new Set(rows.map((d) => d.opened_by))];

  const [{ data: orders }, { data: profiles }] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "id, status, payment_status, payout_status, total, currency, customer_id, vendor_id, seller_vendor_id, created_at",
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
  const profileById = new Map(
    ((profiles as Pick<Profile, "id" | "email" | "full_name">[] | null) ?? []).map(
      (p) => [p.id, p],
    ),
  );

  return rows.map((dispute) => ({
    ...dispute,
    order: orderById.get(dispute.order_id) ?? null,
    opener: profileById.get(dispute.opened_by) ?? null,
  }));
}

export async function countOpenDisputes(): Promise<number> {
  if (!getSupabasePublicEnv()) return 0;
  const supabase = await createClient();
  const { count } = await supabase
    .from("disputes")
    .select("id", { count: "exact", head: true })
    .in("status", ["open", "under_review"]);
  return count ?? 0;
}

