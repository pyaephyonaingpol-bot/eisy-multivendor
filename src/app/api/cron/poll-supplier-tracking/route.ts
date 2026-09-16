import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { buildSupplierFulfillmentRpcArgs } from "@/lib/orders/fulfillment-sync";
import {
  resolveAdapterKindFromProvider,
  resolveSupplierCredentials,
  supplierApiBase,
  bearerAuthHeader,
  getPrintifyShopId,
} from "@/lib/suppliers/auth";
import { supplierIntegrationsMode } from "@/lib/suppliers/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PollableOrder = {
  id: string;
  supplier_order_ref: string | null;
  seller_vendor_id: string | null;
  vendor_id: string | null;
  status: string;
};

async function pollProviderStatus(args: {
  kind: string;
  supplierOrderRef: string;
  vendorId: string | null;
}): Promise<{
  status?: string | null;
  trackingNumber?: string | null;
  trackingCarrier?: string | null;
  trackingUrl?: string | null;
  raw?: Record<string, unknown>;
} | null> {
  const adapter = resolveAdapterKindFromProvider({
    providerKind: args.kind,
    providerSlug: args.kind,
  });
  if (!adapter) return null;

  if (supplierIntegrationsMode() === "mock") {
    return {
      status: "shipped",
      trackingNumber: `MOCK-TRACK-${args.supplierOrderRef.slice(0, 8)}`,
      trackingCarrier: "MOCK",
      trackingUrl: null,
      raw: { mock: true },
    };
  }

  const credentials = resolveSupplierCredentials(adapter, null);
  const base = supplierApiBase(adapter);
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...bearerAuthHeader(credentials),
  };

  if (adapter === "cj_dropshipping") {
    if (credentials.accessToken) {
      headers["CJ-Access-Token"] = credentials.accessToken;
    }
    if (credentials.apiKey) {
      headers["CJ-API-KEY"] = credentials.apiKey;
    }
  }

  let path = "";
  if (adapter === "cj_dropshipping") {
    path = `/shopping/order/getOrderDetail?orderId=${encodeURIComponent(args.supplierOrderRef)}`;
  } else if (adapter === "dsers") {
    path = `/orders/${encodeURIComponent(args.supplierOrderRef)}`;
  } else if (adapter === "spocket") {
    path = `/orders/${encodeURIComponent(args.supplierOrderRef)}`;
  } else if (adapter === "printful") {
    path = `/orders/${encodeURIComponent(args.supplierOrderRef)}`;
  } else if (adapter === "printify") {
    const shopId = getPrintifyShopId(credentials);
    if (!shopId) return null;
    path = `/shops/${encodeURIComponent(shopId)}/orders/${encodeURIComponent(args.supplierOrderRef)}.json`;
  }

  if (!path) return null;

  const response = await fetch(`${base}${path}`, {
    headers,
    cache: "no-store",
  });
  if (!response.ok) {
    return null;
  }

  const json = (await response.json()) as Record<string, unknown>;
  const data = (json.result ?? json.data ?? json.order ?? json) as Record<
    string,
    unknown
  >;

  const trackingNumber = String(
    data.tracking_number ??
      data.trackingNumber ??
      data.trackNumber ??
      (Array.isArray(data.shipments)
        ? (data.shipments[0] as Record<string, unknown>)?.tracking_number
        : "") ??
      "",
  ).trim();

  return {
    status: String(data.status ?? data.fulfillment_status ?? data.state ?? ""),
    trackingNumber: trackingNumber || null,
    trackingCarrier: String(
      data.carrier ?? data.tracking_company ?? data.logisticName ?? "",
    ).trim() || null,
    trackingUrl: String(data.tracking_url ?? data.trackingUrl ?? "").trim() || null,
    raw: json,
  };
}

/**
 * Cron: poll supplier APIs for tracking updates on open orders that already
 * have a supplier_order_ref (fallback when webhooks are unavailable).
 * Auth: Authorization: Bearer <CRON_SECRET>
 */
async function handle(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!secret || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let limit = 25;
  try {
    const body = (await request.json()) as { limit?: number };
    if (body.limit != null) {
      limit = Math.max(1, Math.min(100, Number(body.limit)));
    }
  } catch {
    // empty ok
  }

  const supabase = createServiceClient();
  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, supplier_order_ref, seller_vendor_id, vendor_id, status")
    .not("supplier_order_ref", "is", null)
    .in("status", ["paid", "processing", "shipped"])
    .order("updated_at", { ascending: true })
    .limit(limit);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = (orders as PollableOrder[] | null) ?? [];
  let updated = 0;
  const results: Array<Record<string, unknown>> = [];

  for (const order of rows) {
    if (!order.supplier_order_ref) continue;

    // Infer provider from fulfillment job response when possible
    const { data: job } = await supabase
      .from("supplier_fulfillment_jobs")
      .select("provider_kind, provider_id, response_payload")
      .eq("order_id", order.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let kindHint: string | null = job?.provider_kind ?? null;
    const responseMeta = (job?.response_payload ?? {}) as Record<string, unknown>;
    if (responseMeta.adapter_kind) {
      kindHint = String(responseMeta.adapter_kind);
    } else if (job?.provider_id) {
      const { data: provider } = await supabase
        .from("supplier_providers")
        .select("slug, kind")
        .eq("id", job.provider_id)
        .maybeSingle();
      kindHint = provider?.slug ?? provider?.kind ?? kindHint;
    }

    try {
      const polled = await pollProviderStatus({
        kind: kindHint ?? "cj_dropshipping",
        supplierOrderRef: order.supplier_order_ref,
        vendorId: order.seller_vendor_id ?? order.vendor_id,
      });
      if (!polled) {
        results.push({ order_id: order.id, status: "no_update" });
        continue;
      }

      if (!polled.trackingNumber && !polled.status) {
        results.push({ order_id: order.id, status: "empty" });
        continue;
      }

      const args = buildSupplierFulfillmentRpcArgs({
        orderId: order.id,
        supplierOrderRef: order.supplier_order_ref,
        supplierStatus: polled.status,
        trackingNumber: polled.trackingNumber,
        trackingCarrier: polled.trackingCarrier,
        trackingUrl: polled.trackingUrl,
        source: "supplier_poll",
        payload: polled.raw ?? {},
        note: "Supplier tracking poll",
      });

      const { error: syncError } = await supabase.rpc(
        "sync_order_fulfillment",
        args,
      );
      if (syncError) {
        results.push({ order_id: order.id, status: "error", error: syncError.message });
        continue;
      }

      updated += 1;
      results.push({
        order_id: order.id,
        status: "updated",
        tracking_number: polled.trackingNumber,
        supplier_status: polled.status,
      });
    } catch (err) {
      results.push({
        order_id: order.id,
        status: "error",
        error: err instanceof Error ? err.message : "poll failed",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: rows.length,
    updated,
    results,
  });
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}
