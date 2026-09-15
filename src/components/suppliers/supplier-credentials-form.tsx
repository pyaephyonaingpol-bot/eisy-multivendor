"use client";

import { useActionState } from "react";
import {
  saveSupplierCredentialsAction,
  type SupplierCredentialState,
} from "@/lib/suppliers/actions";

const initialState: SupplierCredentialState = null;

type ProviderOption = {
  id: string;
  name: string;
  kind: string;
  slug: string;
};

type Existing = {
  provider_id: string;
  account_email: string | null;
  api_key: string | null;
  access_token: string | null;
  is_active: boolean;
};

export function SupplierCredentialsForm({
  providers,
  existing,
}: {
  providers: ProviderOption[];
  existing: Existing[];
}) {
  const [state, formAction, pending] = useActionState(
    saveSupplierCredentialsAction,
    initialState,
  );

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">
          Connect supplier APIs
        </h2>
        <p className="text-sm text-zinc-600">
          Save CJ Dropshipping and DSers credentials for catalog search and
          automated order routing. Leave blank fields unchanged when re-saving.
        </p>
      </div>

      {existing.length > 0 ? (
        <ul className="space-y-1 text-sm text-zinc-600">
          {existing.map((row) => {
            const provider = providers.find((p) => p.id === row.provider_id);
            return (
              <li key={row.provider_id}>
                {provider?.name ?? row.provider_id}:{" "}
                {row.is_active ? "connected" : "inactive"}
                {row.account_email ? ` · ${row.account_email}` : ""}
                {row.api_key ? ` · key ${row.api_key}` : ""}
              </li>
            );
          })}
        </ul>
      ) : null}

      <form action={formAction} className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm sm:col-span-2">
          Platform
          <select
            name="provider_id"
            required
            className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2"
            defaultValue={providers[0]?.id}
          >
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name} ({provider.kind})
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Account email
          <input
            name="account_email"
            type="email"
            className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2"
            placeholder="supplier@example.com"
          />
        </label>
        <label className="text-sm">
          API key
          <input
            name="api_key"
            className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 font-mono text-xs"
            placeholder="CJ API key or DSers key"
          />
        </label>
        <label className="text-sm">
          API secret
          <input
            name="api_secret"
            className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 font-mono text-xs"
            placeholder="Optional"
          />
        </label>
        <label className="text-sm">
          Access token
          <input
            name="access_token"
            className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 font-mono text-xs"
            placeholder="CJ access token"
          />
        </label>
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={pending || providers.length === 0}
            className="rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save credentials"}
          </button>
        </div>
        {state?.error ? (
          <p className="text-sm text-red-600 sm:col-span-2" role="alert">
            {state.error}
          </p>
        ) : null}
        {state?.success ? (
          <p className="text-sm text-emerald-700 sm:col-span-2">{state.success}</p>
        ) : null}
      </form>
    </section>
  );
}
