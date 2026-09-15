import { createSupplierWebhookHandler } from "@/lib/suppliers/webhook-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Spocket tracking / order status webhook */
export const POST = createSupplierWebhookHandler("spocket");
