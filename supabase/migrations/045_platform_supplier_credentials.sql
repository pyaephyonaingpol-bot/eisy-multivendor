-- NOTE: If supplier_providers is missing, run 046_bootstrap_supplier_providers_and_platform_credentials.sql first (or the paste script bootstrap_supplier_providers.sql).
-- =============================================================================
-- 045_platform_supplier_credentials.sql
--
-- Platform-owned supplier API keys (CJ, DSers, Spocket, Printful, Printify).
-- Vendors browse a unified catalog and one-click import without their own keys.
-- =============================================================================

create table if not exists public.platform_supplier_credentials (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null unique references public.supplier_providers (id) on delete cascade,
  api_key text,
  api_secret text,
  access_token text,
  refresh_token text,
  account_email text,
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists platform_supplier_credentials_active_idx
  on public.platform_supplier_credentials (is_active);

comment on table public.platform_supplier_credentials is
  'Platform-owned supplier API credentials. Vendors do not store their own keys.';

alter table public.platform_supplier_credentials enable row level security;

drop policy if exists "platform_supplier_credentials_admin_all" on public.platform_supplier_credentials;
create policy "platform_supplier_credentials_admin_all"
  on public.platform_supplier_credentials
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- Service role bypasses RLS for catalog/fulfillment resolution.
