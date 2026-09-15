import { createServiceClient } from "@/lib/supabase/admin";
import {
  createExternalFulfillmentOrder,
  parseSupplierKind,
  type ExternalSupplierKind,
  type SupplierCredentials,
  type SupplierFulfillmentRequest,
} from "@/lib/suppliers";

type JobRow = {
  id: string;
  order_id: string;
  provider_id: string | null;
  provider_kind: string | null;
  attempts: number;
};

function asShipTo(address: Record<string, unknown> | null | undefined) {
  return {
    fullName: String(address?.full_name ?? address?.name ?? "Customer"),
    phone: (address?.phone as string | null) ?? null,
    email: (address?.email as string | null) ?? null,
    line1: String(address?.line1 ?? address?.address1 ?? "Address TBD"),
    line2: (address?.line2 as string | null) ?? null,
    city: String(address?.city ?? "Yangon"),
    region: (address?.region as string | null) ?? null,
    postalCode: (address?.postal_code as string | null) ?? null,
    countryCode: String(address?.country ?? address?.country_code ?? "MM"),
  };
}

async function loadCredentials(
  vendorId: string | null,
  providerId: string | null,
): Promise<SupplierCredentials | null> {
  if (!vendorId || !providerId) return null;
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("vendor_supplier_credentials")
    .select(
      "api_key, api_secret, access_token, refresh_token, account_email, metadata",
    )
    .eq("vendor_id", vendorId)
    .eq("provider_id", providerId)
    .eq("is_active", true)
    .maybeSingle();

  if (!data) return null;
  return {
    apiKey: data.api_key,
    apiSecret: data.api_secret,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    accountEmail: data.account_email,
    metadata: (data.metadata ?? {}) as Record<string, unknown>,
  };
}

async function buildFulfillmentRequest(
  orderId: string,
  kind: ExternalSupplierKind,
): Promise<SupplierFulfillmentRequest> {
  const supabase = createServiceClient();
  const { data: order, error } = await supabase
    .from("orders")
    .select(
      "id, shipping_address, seller_vendor_id, vendor_id, customer_id",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error || !order) {
    throw new Error(error?.message ?? "Order not found for fulfillment.");
  }

  const { data: items } = await supabase
    .from("order_items")
    .select(
      "quantity, product_name, listing_product_id, source_product_id, product_id, supplier_provider_id, supplier_route_id",
    )
    .eq("order_id", orderId);

  const lineRows = items ?? [];
  const listingIds = lineRows
    .map((row) => row.listing_product_id ?? row.product_id)
    .filter(Boolean) as string[];

  const { data: products } = listingIds.length
    ? await supabase
        .from("products")
        .select("id, images, sku")
        .in("id", listingIds)
    : { data: [] as Array<{ id: string; images: unknown; sku: string | null }> };

  const productById = new Map((products ?? []).map((p) => [p.id, p]));

  const routeIds = lineRows
    .map((row) => row.supplier_route_id)
    .filter(Boolean) as string[];
  const { data: routes } = routeIds.length
    ? await supabase
        .from("product_supplier_routes")
        .select("id, external_sku, provider_id")
        .in("id", routeIds)
    : { data: [] as Array<{ id: string; external_sku: string | null; provider_id: string }> };

  const routeById = new Map((routes ?? []).map((r) => [r.id, r]));

  const importKeys = lineRows
    .map((row) => row.listing_product_id ?? row.product_id)
    .filter(Boolean) as string[];
  const { data: imports } = importKeys.length
    ? await supabase
        .from("external_product_imports")
        .select(
          "product_id, external_product_id, external_variant_id, external_sku, provider_id",
        )
        .in("product_id", importKeys)
    : {
        data: [] as Array<{
          product_id: string | null;
          external_product_id: string;
          external_variant_id: string | null;
          external_sku: string | null;
          provider_id: string;
        }>,
      };

  const importByProduct = new Map(
    (imports ?? [])
      .filter((row) => row.product_id)
      .map((row) => [row.product_id as string, row]),
  );

  const lines = lineRows.map((row) => {
    const listingId = row.listing_product_id ?? row.product_id;
    const product = listingId ? productById.get(listingId) : null;
    const route = row.supplier_route_id
      ? routeById.get(row.supplier_route_id)
      : null;
    const imported = listingId ? importByProduct.get(listingId) : null;
    const images = Array.isArray(product?.images)
      ? (product?.images as string[])
      : [];

    return {
      externalProductId: imported?.external_product_id ?? null,
      externalVariantId: imported?.external_variant_id ?? null,
      externalSku:
        imported?.external_sku ??
        route?.external_sku ??
        product?.sku ??
        null,
      quantity: Number(row.quantity) || 1,
      listingProductId: listingId,
      productName: row.product_name,
      imageUrl: images[0] ?? null,
    };
  });

  void kind;

  return {
    orderId,
    orderNumber: orderId,
    shipTo: asShipTo(
      (order.shipping_address ?? {}) as Record<string, unknown>,
    ),
    lines,
    note: `EISY Myanmar order ${orderId}`,
  };
}

export async function processSupplierFulfillmentJobs(limit = 20): Promise<{
  processed: number;
  submitted: number;
  failed: number;
  skipped: number;
  results: Array<Record<string, unknown>>;
}> {
  const supabase = createServiceClient();
  const { data: jobs, error } = await supabase.rpc(
    "claim_supplier_fulfillment_jobs",
    { p_limit: limit },
  );

  if (error) {
    throw new Error(error.message);
  }

  const claimed = (jobs ?? []) as JobRow[];
  let submitted = 0;
  let failed = 0;
  let skipped = 0;
  const results: Array<Record<string, unknown>> = [];

  for (const job of claimed) {
    const kind = parseSupplierKind(job.provider_kind);
    if (!kind) {
      await supabase.rpc("complete_supplier_fulfillment_job", {
        p_job_id: job.id,
        p_status: "skipped",
        p_supplier_order_ref: null,
        p_response: { reason: "unsupported_provider_kind" },
        p_error: `Unsupported provider kind: ${job.provider_kind}`,
      });
      skipped += 1;
      results.push({ job_id: job.id, status: "skipped" });
      continue;
    }

    try {
      const { data: order } = await supabase
        .from("orders")
        .select("seller_vendor_id, vendor_id")
        .eq("id", job.order_id)
        .maybeSingle();

      const credentials = await loadCredentials(
        order?.seller_vendor_id ?? order?.vendor_id ?? null,
        job.provider_id,
      );

      const request = await buildFulfillmentRequest(job.order_id, kind);
      const hasExternalIds = request.lines.some(
        (line) => line.externalProductId || line.externalVariantId || line.externalSku,
      );
      if (!hasExternalIds) {
        await supabase.rpc("complete_supplier_fulfillment_job", {
          p_job_id: job.id,
          p_status: "skipped",
          p_supplier_order_ref: null,
          p_response: { reason: "no_external_sku" },
          p_error:
            "Order lines have no CJ/DSers external SKU. Import from Integrations first.",
        });
        skipped += 1;
        results.push({ job_id: job.id, status: "skipped", reason: "no_external_sku" });
        continue;
      }

      const outcome = await createExternalFulfillmentOrder(
        kind,
        request,
        credentials,
      );

      if (outcome.ok && outcome.supplierOrderRef) {
        await supabase.rpc("complete_supplier_fulfillment_job", {
          p_job_id: job.id,
          p_status: "submitted",
          p_supplier_order_ref: outcome.supplierOrderRef,
          p_response: outcome.raw,
          p_error: null,
        });
        submitted += 1;
        results.push({
          job_id: job.id,
          status: "submitted",
          supplier_order_ref: outcome.supplierOrderRef,
        });
      } else {
        await supabase.rpc("complete_supplier_fulfillment_job", {
          p_job_id: job.id,
          p_status: "failed",
          p_supplier_order_ref: null,
          p_response: outcome.raw,
          p_error: outcome.error ?? "Supplier create order failed",
        });
        failed += 1;
        results.push({
          job_id: job.id,
          status: "failed",
          error: outcome.error,
        });
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Fulfillment processing failed";
      await supabase.rpc("complete_supplier_fulfillment_job", {
        p_job_id: job.id,
        p_status: "failed",
        p_supplier_order_ref: null,
        p_response: {},
        p_error: message,
      });
      failed += 1;
      results.push({ job_id: job.id, status: "failed", error: message });
    }
  }

  return {
    processed: claimed.length,
    submitted,
    failed,
    skipped,
    results,
  };
}

export async function enqueueSupplierFulfillmentForOrders(
  orderIds: string[],
): Promise<void> {
  if (orderIds.length === 0) return;
  const supabase = createServiceClient();
  for (const orderId of orderIds) {
    await supabase.rpc("enqueue_supplier_fulfillment_for_order", {
      p_order_id: orderId,
    });
  }
}
