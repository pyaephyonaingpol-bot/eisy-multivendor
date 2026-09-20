import "server-only";

import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { resolveSupplierCredentials } from "@/lib/suppliers/auth";
import {
  SUPPLIER_PROVIDER_SLUGS,
  type ExternalSupplierKind,
  type SupplierCredentials,
} from "@/lib/suppliers/types";

/**
 * Load platform-owned credentials from `platform_supplier_credentials`
 * (service role). Falls back silently when the table or key is missing.
 *
 * Server-only — must not be imported from Client Components.
 */
export async function loadPlatformCredentialsFromDb(
  kind: ExternalSupplierKind,
): Promise<SupplierCredentials | null> {
  try {
    const supabase = createServiceClient();
    const slug = SUPPLIER_PROVIDER_SLUGS[kind];
    const { data: provider } = await supabase
      .from("supplier_providers")
      .select("id")
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();

    if (!provider?.id) return null;

    const { data: creds } = await supabase
      .from("platform_supplier_credentials")
      .select(
        "api_key, api_secret, access_token, refresh_token, account_email, metadata, is_active",
      )
      .eq("provider_id", provider.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!creds) return null;

    return {
      apiKey: creds.api_key,
      apiSecret: creds.api_secret,
      accessToken: creds.access_token,
      refreshToken: creds.refresh_token,
      accountEmail: creds.account_email,
      metadata: (creds.metadata ?? {}) as Record<string, unknown>,
    };
  } catch {
    return null;
  }
}

/** Provider row id + fully resolved platform credentials for a supplier kind. */
export async function loadPlatformSupplierContext(
  kind: ExternalSupplierKind,
): Promise<{ providerId: string; credentials: SupplierCredentials } | null> {
  try {
    const supabase = await createClient();
    const slug = SUPPLIER_PROVIDER_SLUGS[kind];
    const { data: provider } = await supabase
      .from("supplier_providers")
      .select("id")
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();

    if (!provider?.id) {
      const fromDb = await loadPlatformCredentialsFromDb(kind);
      const credentials = resolveSupplierCredentials(kind, null, fromDb);
      return { providerId: "", credentials };
    }

    const fromDb = await loadPlatformCredentialsFromDb(kind);
    const credentials = resolveSupplierCredentials(kind, null, fromDb);
    return { providerId: provider.id, credentials };
  } catch {
    const fromDb = await loadPlatformCredentialsFromDb(kind);
    const credentials = resolveSupplierCredentials(kind, null, fromDb);
    return { providerId: "", credentials };
  }
}
