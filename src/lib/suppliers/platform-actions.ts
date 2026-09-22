"use server";

import { revalidatePath } from "next/cache";
import { canAccessAdmin, getSessionProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export type PlatformCredentialState = {
  error?: string;
  success?: string;
} | null;

export async function listPlatformSupplierCredentials() {
  const session = await getSessionProfile();
  if (!session || !canAccessAdmin(session.role)) {
    return { error: "Admin only.", rows: [] as never[], providers: [] as never[] };
  }

  const supabase = await createClient();
  const { data: providers } = await supabase
    .from("supplier_providers")
    .select("id, name, slug, kind, is_active")
    .in("kind", ["cj_dropshipping", "dsers", "spocket", "print_on_demand"])
    .order("name");

  let rows: Array<Record<string, unknown>> = [];
  try {
    const admin = createServiceClient();
    const { data } = await admin
      .from("platform_supplier_credentials")
      .select(
        "id, provider_id, api_key, access_token, account_email, metadata, is_active, updated_at",
      );
    rows = (data ?? []).map((row) => ({
      ...row,
      api_key: row.api_key ? `••••${String(row.api_key).slice(-4)}` : null,
      access_token: row.access_token
        ? `••••${String(row.access_token).slice(-4)}`
        : null,
      has_key: Boolean(row.api_key || row.access_token),
    }));
  } catch {
    rows = [];
  }

  return { rows, providers: providers ?? [] };
}

export async function savePlatformSupplierCredentialsAction(
  _prev: PlatformCredentialState,
  formData: FormData,
): Promise<PlatformCredentialState> {
  const session = await getSessionProfile();
  if (!session || !canAccessAdmin(session.role)) {
    return { error: "Admin only." };
  }

  const providerId = String(formData.get("provider_id") ?? "").trim();
  const apiKey = String(formData.get("api_key") ?? "").trim();
  const apiSecret = String(formData.get("api_secret") ?? "").trim();
  const accessToken = String(formData.get("access_token") ?? "").trim();
  const shopId = String(formData.get("shop_id") ?? "").trim();
  const accountEmail = String(formData.get("account_email") ?? "").trim();

  if (!providerId) return { error: "Choose a supplier platform." };

  try {
    const admin = createServiceClient();
    const { data: existing } = await admin
      .from("platform_supplier_credentials")
      .select("api_key, api_secret, access_token, account_email, metadata")
      .eq("provider_id", providerId)
      .maybeSingle();

    const metadata = {
      ...((existing?.metadata as Record<string, unknown>) ?? {}),
    };
    if (shopId) metadata.shop_id = shopId;

    const { error } = await admin.from("platform_supplier_credentials").upsert(
      {
        provider_id: providerId,
        api_key: apiKey || existing?.api_key || null,
        api_secret: apiSecret || existing?.api_secret || null,
        access_token: accessToken || existing?.access_token || null,
        account_email: accountEmail || existing?.account_email || null,
        metadata,
        is_active: true,
        updated_by: session.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "provider_id" },
    );

    if (error) return { error: error.message };

    revalidatePath("/admin/integrations");
    revalidatePath("/vendor/integrations");
    revalidatePath("/vendor/sourcing");
    return { success: "Platform supplier credentials saved." };
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Could not save credentials. Ensure SUPABASE_SERVICE_ROLE_KEY is set and migration 045 is applied.",
    };
  }
}
