import { createSupplierWebhookHandler } from "@/lib/suppliers/webhook-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Printify order status / shipment webhook */
export const POST = createSupplierWebhookHandler("printify");
