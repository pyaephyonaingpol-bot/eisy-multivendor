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

/** Rich seller profile shown in admin order management. */
export type AdminVendorSummary = Pick<
  Vendor,
  | "id"
  | "name"
  | "slug"
  | "store_name"
  | "contact_email"
  | "telegram_handle"
  | "usdt_payout_address"
  | "usdt_deposit_address"
  | "kyc_status"
  | "status"
> & {
  owner_email: string | null;
  owner_name: string | null;
};

export type AdminOrderRow = Order & {
  items: OrderItem[];
  seller: AdminVendorSummary | null;
  fulfillment: AdminVendorSummary | null;
  open_dispute_count: number;
  dispute_ids: string[];
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

export async function listOrdersForAdmin(opts?: {
  payoutStatus?: Order["payout_status"];
  status?: Order["status"];
  vendorId?: string;
  q?: string;
  limit?: number;
}): Promise<AdminOrderRow[]> {
  if (!getSupabasePublicEnv()) {
    return [];
  }

  const supabase = await createClient();
  let query = supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 100);

  if (opts?.payoutStatus) {
    query = query.eq("payout_status", opts.payoutStatus);
  }
  if (opts?.status) {
    query = query.eq("status", opts.status);
  }
  if (opts?.vendorId) {
    query = query.or(
      `seller_vendor_id.eq.${opts.vendorId},vendor_id.eq.${opts.vendorId}`,
    );
  }

  const { data: orderRows } = await query;
  let orders = (orderRows as Order[] | null) ?? [];
  if (orders.length === 0) {
    return [];
  }

  const search = opts?.q?.trim().toLowerCase();
  if (search) {
    const safe = search.replace(/[%_,]/g, "").slice(0, 80);
    if (safe) {
      // Resolve matching vendor ids by name/store/email/telegram, then filter.
      const { data: vendorMatches } = await supabase
        .from("vendors")
        .select("id, name, store_name, contact_email, telegram_handle, slug")
        .or(
          `name.ilike.%${safe}%,store_name.ilike.%${safe}%,contact_email.ilike.%${safe}%,telegram_handle.ilike.%${safe}%,slug.ilike.%${safe}%`,
        )
        .limit(50);
      const vendorIds = new Set(
        ((vendorMatches as { id: string }[] | null) ?? []).map((v) => v.id),
      );
      orders = orders.filter((order) => {
        if (order.id.toLowerCase().includes(safe)) return true;
        if (vendorIds.has(order.seller_vendor_id)) return true;
        if (vendorIds.has(order.vendor_id)) return true;
        return false;
      });
    }
  }

  return attachAdminVendorsItemsAndDisputes(orders);
}

export async function getOrderForAdmin(
  orderId: string,
): Promise<AdminOrderRow | null> {
  if (!getSupabasePublicEnv() || !orderId) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();
  if (!data) return null;
  const [row] = await attachAdminVendorsItemsAndDisputes([data as Order]);
  return row ?? null;
}

export async function listVendorsForOrderFilter(): Promise<
  Array<Pick<Vendor, "id" | "name" | "store_name" | "slug">>
> {
  if (!getSupabasePublicEnv()) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("vendors")
    .select("id, name, store_name, slug")
    .order("name", { ascending: true })
    .limit(300);
  return (
    (data as Pick<Vendor, "id" | "name" | "store_name" | "slug">[] | null) ?? []
  );
}

async function attachAdminVendorsItemsAndDisputes(
  orders: Order[],
): Promise<AdminOrderRow[]> {
  const supabase = await createClient();
  const orderIds = orders.map((order) => order.id);
  const vendorIds = [
    ...new Set(
      orders.flatMap((order) =>
        [order.vendor_id, order.seller_vendor_id].filter(Boolean),
      ),
    ),
  ];

  const [{ data: itemRows }, { data: vendorRows }, { data: disputeRows }] =
    await Promise.all([
      supabase.from("order_items").select("*").in("order_id", orderIds),
      supabase
        .from("vendors")
        .select(
          "id, name, slug, store_name, contact_email, telegram_handle, usdt_payout_address, usdt_deposit_address, kyc_status, status, owner_id",
        )
        .in("id", vendorIds),
      supabase
        .from("disputes")
        .select("id, order_id, status")
        .in("order_id", orderIds)
        .in("status", ["open", "under_review"]),
    ]);

  const ownerIds = [
    ...new Set(
      ((vendorRows as Array<{ owner_id: string }> | null) ?? []).map(
        (v) => v.owner_id,
      ),
    ),
  ];
  const { data: profileRows } =
    ownerIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, email, full_name")
          .in("id", ownerIds)
      : { data: [] };

  const profilesById = new Map(
    (
      (profileRows as
        | Array<{ id: string; email: string; full_name: string | null }>
        | null) ?? []
    ).map((p) => [p.id, p]),
  );

  type VendorRow = {
    id: string;
    name: string;
    slug: string;
    store_name: string | null;
    contact_email: string | null;
    telegram_handle: string | null;
    usdt_payout_address: string | null;
    usdt_deposit_address: string | null;
    kyc_status: Vendor["kyc_status"];
    status: Vendor["status"];
    owner_id: string;
  };

  const vendorsById = new Map<string, AdminVendorSummary>();
  for (const vendor of (vendorRows as VendorRow[] | null) ?? []) {
    const owner = profilesById.get(vendor.owner_id);
    vendorsById.set(vendor.id, {
      id: vendor.id,
      name: vendor.name,
      slug: vendor.slug,
      store_name: vendor.store_name || vendor.name,
      contact_email: vendor.contact_email || owner?.email || null,
      telegram_handle: vendor.telegram_handle,
      usdt_payout_address:
        vendor.usdt_payout_address || vendor.usdt_deposit_address || null,
      usdt_deposit_address: vendor.usdt_deposit_address,
      kyc_status: vendor.kyc_status,
      status: vendor.status,
      owner_email: owner?.email ?? null,
      owner_name: owner?.full_name ?? null,
    });
  }

  const itemsByOrder = new Map<string, OrderItem[]>();
  for (const item of (itemRows as OrderItem[] | null) ?? []) {
    const list = itemsByOrder.get(item.order_id) ?? [];
    list.push(item);
    itemsByOrder.set(item.order_id, list);
  }

  const disputesByOrder = new Map<string, string[]>();
  for (const dispute of (disputeRows as
    | Array<{ id: string; order_id: string }>
    | null) ?? []) {
    const list = disputesByOrder.get(dispute.order_id) ?? [];
    list.push(dispute.id);
    disputesByOrder.set(dispute.order_id, list);
  }

  return orders.map((order) => {
    const disputeIds = disputesByOrder.get(order.id) ?? [];
    return {
      ...order,
      items: itemsByOrder.get(order.id) ?? [],
      seller:
        vendorsById.get(order.seller_vendor_id) ??
        vendorsById.get(order.vendor_id) ??
        null,
      fulfillment: vendorsById.get(order.vendor_id) ?? null,
      open_dispute_count: disputeIds.length,
      dispute_ids: disputeIds,
    };
  });
}
