import { createClient } from "@/lib/supabase/server";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import type {
  Order,
  OrderFulfillmentEvent,
  OrderItem,
  Vendor,
} from "@/lib/types/database";

export type VendorOrderRow = Order & {
  items: OrderItem[];
  seller: Pick<Vendor, "id" | "name" | "slug"> | null;
  fulfillment: Pick<Vendor, "id" | "name" | "slug"> | null;
  role: "fulfillment" | "seller" | "both";
};

export type BuyerOrderRow = Order & {
  items: OrderItem[];
  seller: Pick<Vendor, "id" | "name" | "slug"> | null;
  fulfillment: Pick<Vendor, "id" | "name" | "slug"> | null;
};

export type BuyerOrderDetail = BuyerOrderRow & {
  events: OrderFulfillmentEvent[];
};

async function attachVendorsAndItems(
  orders: Order[],
): Promise<
  Omit<BuyerOrderRow, never>[]
> {
  const supabase = await createClient();
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

  return orders.map((order) => ({
    ...order,
    items: itemsByOrder.get(order.id) ?? [],
    seller: vendorsById.get(order.seller_vendor_id) ?? null,
    fulfillment: vendorsById.get(order.vendor_id) ?? null,
  }));
}

export async function listOrdersForCustomer(
  customerId: string,
): Promise<BuyerOrderRow[]> {
  if (!getSupabasePublicEnv()) {
    return [];
  }

  const supabase = await createClient();
  const { data: orderRows } = await supabase
    .from("orders")
    .select("*")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(50);

  const orders = (orderRows as Order[] | null) ?? [];
  if (orders.length === 0) {
    return [];
  }

  return attachVendorsAndItems(orders);
}

export async function getOrderForCustomer(
  orderId: string,
  customerId: string,
): Promise<BuyerOrderDetail | null> {
  if (!getSupabasePublicEnv()) {
    return null;
  }

  const supabase = await createClient();
  const { data: orderRow } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .eq("customer_id", customerId)
    .maybeSingle();

  if (!orderRow) {
    return null;
  }

  const [enriched] = await attachVendorsAndItems([orderRow as Order]);
  const { data: eventRows } = await supabase
    .from("order_fulfillment_events")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })
    .limit(30);

  return {
    ...enriched,
    events: (eventRows as OrderFulfillmentEvent[] | null) ?? [],
  };
}

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
