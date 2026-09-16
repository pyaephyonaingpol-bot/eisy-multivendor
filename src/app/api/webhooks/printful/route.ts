import { createSupplierWebhookHandler } from "@/lib/suppliers/webhook-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Printful package shipped / order updated webhook */
export const POST = createSupplierWebhookHandler("printful");
