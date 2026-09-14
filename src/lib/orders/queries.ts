import { createClient } from "@/lib/supabase/server";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import type { Order, OrderItem, Vendor } from "@/lib/types/database";

export type VendorOrderRow = Order & {
  items: OrderItem[];
  seller: Pick<Vendor, "id" | "name" | "slug"> | null;
  fulfillment: Pick<Vendor, "id" | "name" | "slug"> | null;
  role: "fulfillment" | "seller" | "both";
};

export async function listOrdersForVendor(
  vendorId: string,
): Promise<VendorOrderRow[]> {
  if (!getSupabasePublicEnv()) {
    return [];
  }

  const supabase = await createClient();
  const { data: orderRows } = await supabase
    .from("orders")
    .select("*")
    .or(`vendor_id.eq.${vendorId},seller_vendor_id.eq.${vendorId}`)
    .order("created_at", { ascending: false })
    .limit(50);

  const orders = (orderRows as Order[] | null) ?? [];
  if (orders.length === 0) {
    return [];
  }

  const orderIds = orders.map((order) => order.id);
  const vendorIds = [
    ...new Set(
      orders.flatMap((order) =>
        [order.vendor_id, order.seller_vendor_id].filter(Boolean),
      ),
    ),
  ];

  const [{ data: itemRows }, { data: vendorRows }] = await Promise.all([
    supabase.from("order_items").select("*").in("order_id", orderIds),
    supabase.from("vendors").select("id, name, slug").in("id", vendorIds),
  ]);

  const itemsByOrder = new Map<string, OrderItem[]>();
  for (const item of (itemRows as OrderItem[] | null) ?? []) {
    const list = itemsByOrder.get(item.order_id) ?? [];
    list.push(item);
    itemsByOrder.set(item.order_id, list);
  }

  const vendorsById = new Map(
    ((vendorRows as Pick<Vendor, "id" | "name" | "slug">[] | null) ?? []).map(
      (vendor) => [vendor.id, vendor],
    ),
  );

  return orders.map((order) => {
    const isFulfillment = order.vendor_id === vendorId;
    const isSeller = order.seller_vendor_id === vendorId;
    return {
      ...order,
      items: itemsByOrder.get(order.id) ?? [],
      seller: vendorsById.get(order.seller_vendor_id) ?? null,
      fulfillment: vendorsById.get(order.vendor_id) ?? null,
      role:
        isFulfillment && isSeller
          ? "both"
          : isFulfillment
            ? "fulfillment"
            : "seller",
    };
  });
}
