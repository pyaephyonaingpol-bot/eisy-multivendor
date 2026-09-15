import { createSupplierWebhookHandler } from "@/lib/suppliers/webhook-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** DSers / AliExpress bridge tracking webhook */
export const POST = createSupplierWebhookHandler("dsers");
