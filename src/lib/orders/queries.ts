import { createClient } from "@/lib/supabase/server";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import {
  deriveAdminEscrowStatus,
  type AdminEscrowStatus,
} from "@/lib/orders/status";
import type {
  FulfillmentChannel,
  Order,
  OrderFulfillmentEvent,
  OrderItem,
  Vendor,
} from "@/lib/types/database";

function normalizeOrder(row: Order): Order {
  const channel =
    (row as Order & { fulfillment_channel?: FulfillmentChannel | null })
      .fulfillment_channel === "cj"
      ? "cj"
      : "manual";
  const sellerVendorId =
    row.seller_vendor_id ??
    (row as Order & { seller_vendor_id?: string | null }).seller_vendor_id ??
    row.vendor_id;
  return {
    ...row,
    fulfillment_channel: channel,
    seller_vendor_id: sellerVendorId,
  };
}

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
  /** Buyer profile email (from profiles via customer_id). */
  buyer_email: string | null;
  buyer_name: string | null;
  /** Assigned USDT TRC-20 deposit address for this order's payment intent. */
  deposit_address: string | null;
  /** Composite escrow pipeline status for the admin dashboard. */
  escrow_status: AdminEscrowStatus;
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
    ...normalizeOrder(order),
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
  options?: { fulfillmentChannel?: FulfillmentChannel },
): Promise<VendorOrderRow[]> {
  if (!getSupabasePublicEnv()) {
    return [];
  }

  const supabase = await createClient();
  let query = supabase
    .from("orders")
    .select("*")
    .or(`vendor_id.eq.${vendorId},seller_vendor_id.eq.${vendorId}`)
    .order("created_at", { ascending: false })
    .limit(100);

  if (options?.fulfillmentChannel) {
    query = query.eq("fulfillment_channel", options.fulfillmentChannel);
  }

  const { data: orderRows, error } = await query;

  let orders = ((orderRows as Order[] | null) ?? []).map(normalizeOrder);

  // Older DBs without fulfillment_channel: load all then classify in memory.
  if (error && /fulfillment_channel/i.test(error.message)) {
    const { data: legacy } = await supabase
      .from("orders")
      .select("*")
      .or(`vendor_id.eq.${vendorId},seller_vendor_id.eq.${vendorId}`)
      .order("created_at", { ascending: false })
      .limit(100);
    orders = ((legacy as Order[] | null) ?? []).map(normalizeOrder);
    if (options?.fulfillmentChannel) {
      orders = await filterOrdersByChannelFallback(
        orders,
        options.fulfillmentChannel,
      );
    }
  } else if (error) {
    console.warn("listOrdersForVendor:", error.message);
    return [];
  }

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

  // Legacy fallback: classify using line items / CJ registry when channel missing.
  if (options?.fulfillmentChannel && orders.some((o) => !o.fulfillment_channel)) {
    orders = await classifyOrdersWithItems(
      orders,
      itemsByOrder,
      options.fulfillmentChannel,
    );
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

/** Manual / local custom orders only. */
export async function listManualOrdersForVendor(
  vendorId: string,
): Promise<VendorOrderRow[]> {
  return listOrdersForVendor(vendorId, { fulfillmentChannel: "manual" });
}

/** CJ Dropshipping fulfillment orders only. */
export async function listCjOrdersForVendor(
  vendorId: string,
): Promise<VendorOrderRow[]> {
  return listOrdersForVendor(vendorId, { fulfillmentChannel: "cj" });
}

async function filterOrdersByChannelFallback(
  orders: Order[],
  channel: FulfillmentChannel,
): Promise<Order[]> {
  const supabase = await createClient();
  const orderIds = orders.map((o) => o.id);
  if (orderIds.length === 0) return [];

  const [{ data: items }, { data: cjRows }, { data: jobs }] = await Promise.all([
    supabase
      .from("order_items")
      .select("order_id, product_id, listing_product_id, supplier_provider_id")
      .in("order_id", orderIds),
    supabase
      .from("cj_imported_products")
      .select("product_id")
      .limit(5000),
    supabase
      .from("supplier_fulfillment_jobs")
      .select("order_id, provider_kind")
      .in("order_id", orderIds),
  ]);

  const cjProductIds = new Set(
    ((cjRows as { product_id: string }[] | null) ?? []).map((r) => r.product_id),
  );
  const cjOrderIds = new Set<string>();
  for (const item of (items as Array<{
    order_id: string;
    product_id: string | null;
    listing_product_id: string | null;
  }> | null) ?? []) {
    const pid = item.listing_product_id ?? item.product_id;
    if (pid && cjProductIds.has(pid)) cjOrderIds.add(item.order_id);
  }
  for (const job of (jobs as Array<{
    order_id: string;
    provider_kind: string | null;
  }> | null) ?? []) {
    if (job.provider_kind === "cj_dropshipping") cjOrderIds.add(job.order_id);
  }

  return orders.filter((order) => {
    const isCj =
      order.fulfillment_channel === "cj" || cjOrderIds.has(order.id);
    return channel === "cj" ? isCj : !isCj;
  });
}

async function classifyOrdersWithItems(
  orders: Order[],
  itemsByOrder: Map<string, OrderItem[]>,
  channel: FulfillmentChannel,
): Promise<Order[]> {
  const supabase = await createClient();
  const productIds = [
    ...new Set(
      [...itemsByOrder.values()]
        .flat()
        .map((i) => i.listing_product_id ?? i.product_id)
        .filter(Boolean) as string[],
    ),
  ];
  const cjIds = new Set<string>();
  if (productIds.length > 0) {
    const { data } = await supabase
      .from("products")
      .select("id, catalog_kind")
      .in("id", productIds);
    for (const row of (data as Array<{
      id: string;
      catalog_kind: string | null;
    }> | null) ?? []) {
      if (row.catalog_kind === "cj_import") cjIds.add(row.id);
    }
  }

  return orders.filter((order) => {
    const items = itemsByOrder.get(order.id) ?? [];
    const isCj =
      order.fulfillment_channel === "cj" ||
      items.some((item) => {
        const pid = item.listing_product_id ?? item.product_id;
        return Boolean(pid && cjIds.has(pid));
      });
    return channel === "cj" ? isCj : !isCj;
  });
}

export async function listOrdersForAdmin(opts?: {
  payoutStatus?: Order["payout_status"];
  status?: Order["status"];
  escrowStatus?: AdminEscrowStatus;
  vendorId?: string;
  fulfillmentChannel?: FulfillmentChannel;
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

  // Map composite escrow filters onto underlying columns when possible.
  if (opts?.escrowStatus === "pending_payment") {
    query = query.eq("payment_status", "pending");
  } else if (opts?.escrowStatus === "escrow_held") {
    query = query
      .eq("payment_status", "paid")
      .in("payout_status", ["held", "not_applicable"])
      .not("status", "in", '("shipped","delivered","cancelled","refunded")');
  } else if (opts?.escrowStatus === "shipped") {
    query = query.eq("status", "shipped");
  } else if (opts?.escrowStatus === "completed") {
    query = query.or("status.eq.delivered,payout_status.eq.released");
  } else if (opts?.escrowStatus === "disputed") {
    query = query.eq("payout_status", "disputed");
  } else if (opts?.escrowStatus === "refunded") {
    query = query.or(
      "payout_status.eq.refunded,status.eq.refunded,payment_status.eq.refunded",
    );
  } else if (opts?.payoutStatus) {
    query = query.eq("payout_status", opts.payoutStatus);
  }

  if (opts?.status && !opts?.escrowStatus) {
    query = query.eq("status", opts.status);
  }
  if (opts?.vendorId) {
    query = query.or(
      `seller_vendor_id.eq.${opts.vendorId},vendor_id.eq.${opts.vendorId}`,
    );
  }
  if (opts?.fulfillmentChannel) {
    query = query.eq("fulfillment_channel", opts.fulfillmentChannel);
  }

  const { data: orderRows } = await query;
  let orders = ((orderRows as Order[] | null) ?? []).map(normalizeOrder);
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

      const { data: buyerMatches } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .or(`email.ilike.%${safe}%,full_name.ilike.%${safe}%`)
        .limit(50);
      const buyerIds = new Set(
        ((buyerMatches as { id: string }[] | null) ?? []).map((p) => p.id),
      );

      orders = orders.filter((order) => {
        if (order.id.toLowerCase().includes(safe)) return true;
        if (order.payment_tx_hash?.toLowerCase().includes(safe)) return true;
        if (vendorIds.has(order.seller_vendor_id)) return true;
        if (vendorIds.has(order.vendor_id)) return true;
        if (buyerIds.has(order.customer_id)) return true;
        return false;
      });
    }
  }

  const rows = await attachAdminVendorsItemsAndDisputes(orders);

  // Refine composite filters that may over-fetch (e.g. completed / escrow_held).
  if (opts?.escrowStatus) {
    return rows.filter((row) => row.escrow_status === opts.escrowStatus);
  }
  return rows;
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
  const customerIds = [
    ...new Set(orders.map((order) => order.customer_id).filter(Boolean)),
  ];
  const intentIds = [
    ...new Set(
      orders
        .map((order) => order.payment_intent_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const [
    { data: itemRows },
    { data: vendorRows },
    { data: disputeRows },
    { data: buyerProfileRows },
    { data: intentRows },
  ] = await Promise.all([
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
    customerIds.length > 0
      ? supabase
          .from("profiles")
          .select("id, email, full_name")
          .in("id", customerIds)
      : Promise.resolve({ data: [] }),
    intentIds.length > 0
      ? supabase
          .from("usdt_payment_intents")
          .select("id, deposit_address")
          .in("id", intentIds)
      : Promise.resolve({ data: [] }),
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

  const buyersById = new Map(
    (
      (buyerProfileRows as
        | Array<{ id: string; email: string; full_name: string | null }>
        | null) ?? []
    ).map((p) => [p.id, p]),
  );

  const depositByIntentId = new Map(
    (
      (intentRows as Array<{ id: string; deposit_address: string }> | null) ??
      []
    ).map((intent) => [intent.id, intent.deposit_address]),
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
    const buyer = buyersById.get(order.customer_id);
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
      buyer_email: buyer?.email ?? null,
      buyer_name: buyer?.full_name ?? null,
      deposit_address: order.payment_intent_id
        ? depositByIntentId.get(order.payment_intent_id) ?? null
        : null,
      escrow_status: deriveAdminEscrowStatus(order),
    };
  });
}
