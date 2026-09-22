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
    let providerId: string | null = null;

    const { data: bySlug } = await supabase
      .from("supplier_providers")
      .select("id")
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();
    providerId = bySlug?.id ?? null;

    if (!providerId) {
      // Fallback: match by provider kind (non-POD only — POD shares one enum).
      if (kind !== "printful" && kind !== "printify") {
        const { data: byKind } = await supabase
          .from("supplier_providers")
          .select("id")
          .eq("kind", kind)
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();
        providerId = byKind?.id ?? null;
      }
    }

    if (!providerId) return null;

    const { data: creds } = await supabase
      .from("platform_supplier_credentials")
      .select(
        "api_key, api_secret, access_token, refresh_token, account_email, metadata, is_active",
      )
      .eq("provider_id", providerId)
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

const PLATFORM_KINDS: ExternalSupplierKind[] = [
  "cj_dropshipping",
  "dsers",
  "spocket",
  "printful",
  "printify",
];

/**
 * Supplier kinds that currently have live keys (env and/or
 * `platform_supplier_credentials`). Safe for server Components / routes.
 */
export async function listLivePlatformSuppliers(): Promise<
  ExternalSupplierKind[]
> {
  const live: ExternalSupplierKind[] = [];
  await Promise.all(
    PLATFORM_KINDS.map(async (kind) => {
      const linked = await loadPlatformSupplierContext(kind);
      const creds = linked?.credentials;
      if (creds?.apiKey?.trim() || creds?.accessToken?.trim()) {
        live.push(kind);
      }
    }),
  );
  return live;
}

/** True when this kind has a usable platform key from DB and/or env. */
export async function platformSupplierHasLiveKey(
  kind: ExternalSupplierKind,
): Promise<boolean> {
  const linked = await loadPlatformSupplierContext(kind);
  const creds = linked?.credentials;
  return Boolean(creds?.apiKey?.trim() || creds?.accessToken?.trim());
}
