import { redirect } from "next/navigation";
import { PlatformSupplierCredentialsForm } from "@/components/suppliers/platform-supplier-credentials-form";
import { canAccessAdmin, getSessionProfile } from "@/lib/auth/session";
import { listPlatformSupplierCredentials } from "@/lib/suppliers/platform-actions";
import {
  hasLiveSupplierCredentials,
  listConfiguredPlatformSuppliers,
} from "@/lib/suppliers/auth";
import {
  supplierIntegrationsMode,
  supplierPlatformLabel,
} from "@/lib/suppliers/types";

export const dynamic = "force-dynamic";

export default async function AdminIntegrationsPage() {
  const session = await getSessionProfile();
  if (!session) redirect("/login?next=/admin/integrations");
  if (!canAccessAdmin(session.role)) redirect("/unauthorized?from=admin");

  const { rows, providers, error } = await listPlatformSupplierCredentials();
  const mode = supplierIntegrationsMode();
  const configured = listConfiguredPlatformSuppliers();

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Supplier APIs</h1>
        <p className="max-w-2xl text-zinc-600">
          Configure the platform&apos;s CJ, DSers, Spocket, and POD API keys.
          Vendors use a unified catalog and one-click import — they never paste
          their own supplier credentials.
        </p>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
        <p>
          Runtime mode: <strong>{mode}</strong>
        </p>
        <p className="mt-1">
          Env keys detected:{" "}
          {configured.length
            ? configured.map((k) => supplierPlatformLabel(k)).join(", ")
            : "none (mock catalog / DB keys only)"}
        </p>
        <p className="mt-1 text-zinc-500">
          Keys can live in this table and/or environment variables (
          <code className="rounded bg-white px-1">CJ_API_KEY</code>,{" "}
          <code className="rounded bg-white px-1">DSERS_API_KEY</code>,{" "}
          <code className="rounded bg-white px-1">PRINTIFY_API_KEY</code>, …).
          DB values take precedence when present.
        </p>
        {hasLiveSupplierCredentials("printify") ? null : (
          <p className="mt-2 text-amber-800">
            Printify needs <code className="rounded bg-white px-1">PRINTIFY_SHOP_ID</code>{" "}
            (env or Shop ID field) in addition to an API key.
          </p>
        )}
      </div>

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      <PlatformSupplierCredentialsForm
        providers={providers}
        existing={rows as Array<{
          provider_id: string;
          has_key?: boolean;
          account_email?: string | null;
          metadata?: Record<string, unknown> | null;
        }>}
      />
    </div>
  );
}
