"use client";

import { useActionState } from "react";
import {
  savePlatformSupplierCredentialsAction,
  type PlatformCredentialState,
} from "@/lib/suppliers/platform-actions";

type Provider = {
  id: string;
  name: string;
  slug: string;
  kind: string;
  is_active: boolean;
};

type Existing = {
  provider_id: string;
  has_key?: boolean;
  account_email?: string | null;
  metadata?: Record<string, unknown> | null;
};

const initial: PlatformCredentialState = null;

export function PlatformSupplierCredentialsForm({
  providers,
  existing,
}: {
  providers: Provider[];
  existing: Existing[];
}) {
  const [state, action, pending] = useActionState(
    savePlatformSupplierCredentialsAction,
    initial,
  );

  const byProvider = new Map(existing.map((row) => [row.provider_id, row]));

  return (
    <form action={action} className="space-y-4 rounded-xl border border-zinc-200 p-4">
      <div>
        <h2 className="text-lg font-semibold text-zinc-950">
          Platform supplier API keys
        </h2>
        <p className="mt-1 text-sm text-zinc-600">
          These keys power the unified vendor catalog and one-click import.
          Vendors never enter their own CJ / DSers / POD credentials.
          Leave a field blank to keep the previously saved value.
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="provider_id" className="text-sm font-medium">
          Supplier
        </label>
        <select
          id="provider_id"
          name="provider_id"
          required
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          defaultValue=""
        >
          <option value="" disabled>
            Select supplier…
          </option>
          {providers.map((provider) => {
            const row = byProvider.get(provider.id);
            return (
              <option key={provider.id} value={provider.id}>
                {provider.name}
                {row?.has_key ? " · connected" : ""}
              </option>
            );
          })}
        </select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="api_key" className="text-sm font-medium">
            API key
          </label>
          <input
            id="api_key"
            name="api_key"
            autoComplete="off"
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 font-mono text-sm"
            placeholder="Leave blank to keep existing"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="access_token" className="text-sm font-medium">
            Access token
          </label>
          <input
            id="access_token"
            name="access_token"
            autoComplete="off"
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 font-mono text-sm"
            placeholder="Optional (e.g. CJ)"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="api_secret" className="text-sm font-medium">
            API secret
          </label>
          <input
            id="api_secret"
            name="api_secret"
            autoComplete="off"
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 font-mono text-sm"
            placeholder="Optional"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="shop_id" className="text-sm font-medium">
            Shop ID (Printify)
          </label>
          <input
            id="shop_id"
            name="shop_id"
            autoComplete="off"
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 font-mono text-sm"
            placeholder="Optional"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="account_email" className="text-sm font-medium">
          Account email (optional)
        </label>
        <input
          id="account_email"
          name="account_email"
          type="email"
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
        />
      </div>

      {state?.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
      {state?.success ? (
        <p className="text-sm text-emerald-700">{state.success}</p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save platform credentials"}
      </button>
    </form>
  );
}
