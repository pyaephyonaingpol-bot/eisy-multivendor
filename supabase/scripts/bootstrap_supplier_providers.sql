-- =============================================================================
-- 046_bootstrap_supplier_providers_and_platform_credentials.sql
--
-- Complete, ordered bootstrap for supplier integrations on incomplete DBs.
-- Creates enums + supplier_providers FIRST, then platform credentials,
-- indexes, and RLS — no references before the parent tables exist.
--
-- Paste into Supabase → SQL Editor → Run.
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 1) Helpers (policies need is_admin)
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.is_admin()') is null then
    create or replace function public.is_admin()
    returns boolean
    language sql
    stable
    security definer
    set search_path = public
    as $fn$
      select exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role = 'admin'
      );
    $fn$;
  end if;
exception when others then
  -- profiles may be missing; create a safe stub that returns false
  create or replace function public.is_admin()
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
  as $fn$
    select false;
  $fn$;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Enum (all known values in one create — no catalog name[] comparisons)
-- ---------------------------------------------------------------------------
do $$
begin
  create type public.supplier_provider_kind as enum (
    'internal',
    'cj_dropshipping',
    'dsers',
    'spocket',
    'print_on_demand',
    'warehouse',
    'other'
  );
exception
  when duplicate_object then null;
end;
$$;

-- Add labels that older enums may be missing (PG 15+ supports IF NOT EXISTS)
alter type public.supplier_provider_kind add value if not exists 'internal';
alter type public.supplier_provider_kind add value if not exists 'cj_dropshipping';
alter type public.supplier_provider_kind add value if not exists 'dsers';
alter type public.supplier_provider_kind add value if not exists 'spocket';
alter type public.supplier_provider_kind add value if not exists 'print_on_demand';
alter type public.supplier_provider_kind add value if not exists 'warehouse';
alter type public.supplier_provider_kind add value if not exists 'other';

-- ---------------------------------------------------------------------------
-- 3) supplier_providers (parent table — create BEFORE any FKs to it)
-- ---------------------------------------------------------------------------
create table if not exists public.supplier_providers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  kind public.supplier_provider_kind not null default 'other',
  default_origin_country text,
  supports_regions text[] not null default '{}'::text[],
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.supplier_providers
  add column if not exists default_origin_country text;
alter table public.supplier_providers
  add column if not exists supports_regions text[] not null default '{}'::text[];
alter table public.supplier_providers
  add column if not exists notes text;
alter table public.supplier_providers
  add column if not exists is_active boolean not null default true;
alter table public.supplier_providers
  add column if not exists created_at timestamptz not null default now();
alter table public.supplier_providers
  add column if not exists updated_at timestamptz not null default now();

create index if not exists supplier_providers_is_active_idx
  on public.supplier_providers (is_active);

create index if not exists supplier_providers_kind_idx
  on public.supplier_providers (kind);

comment on table public.supplier_providers is
  'Platform supplier catalog sources (CJ, DSers, Spocket, Printful, Printify).';

insert into public.supplier_providers (
  slug, name, kind, default_origin_country, supports_regions, notes, is_active
)
values
  (
    'cj-dropshipping',
    'CJ Dropshipping',
    'cj_dropshipping',
    'CN',
    array['MM', 'SEA', 'CN', 'EU', 'US', 'GLOBAL'],
    'China warehouse dropship.',
    true
  ),
  (
    'dsers',
    'DSers (AliExpress)',
    'dsers',
    'CN',
    array['MM', 'SEA', 'CN', 'EU', 'US', 'GLOBAL'],
    'AliExpress via DSers.',
    true
  ),
  (
    'spocket',
    'Spocket',
    'spocket',
    'US',
    array['US', 'EU', 'SEA', 'GLOBAL', 'MM'],
    'US/EU faster lanes.',
    true
  ),
  (
    'printful',
    'Printful (POD)',
    'print_on_demand',
    'US',
    array['US', 'EU', 'GLOBAL'],
    'Print-on-demand apparel.',
    true
  ),
  (
    'printify',
    'Printify (POD)',
    'print_on_demand',
    'US',
    array['US', 'EU', 'GLOBAL'],
    'Print-on-demand network.',
    true
  )
on conflict (slug) do update
set
  name = excluded.name,
  kind = excluded.kind,
  default_origin_country = excluded.default_origin_country,
  supports_regions = excluded.supports_regions,
  notes = excluded.notes,
  is_active = true,
  updated_at = now();

alter table public.supplier_providers enable row level security;

drop policy if exists "supplier_providers_select_authenticated" on public.supplier_providers;
create policy "supplier_providers_select_authenticated"
  on public.supplier_providers for select
  using (auth.role() = 'authenticated' or public.is_admin());

drop policy if exists "supplier_providers_admin_write" on public.supplier_providers;
create policy "supplier_providers_admin_write"
  on public.supplier_providers for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 4) platform_supplier_credentials (FK → supplier_providers — after parent)
-- ---------------------------------------------------------------------------
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
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.platform_supplier_credentials
  add column if not exists api_key text;
alter table public.platform_supplier_credentials
  add column if not exists api_secret text;
alter table public.platform_supplier_credentials
  add column if not exists access_token text;
alter table public.platform_supplier_credentials
  add column if not exists refresh_token text;
alter table public.platform_supplier_credentials
  add column if not exists account_email text;
alter table public.platform_supplier_credentials
  add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.platform_supplier_credentials
  add column if not exists is_active boolean not null default true;
alter table public.platform_supplier_credentials
  add column if not exists updated_by uuid;
alter table public.platform_supplier_credentials
  add column if not exists created_at timestamptz not null default now();
alter table public.platform_supplier_credentials
  add column if not exists updated_at timestamptz not null default now();

create index if not exists platform_supplier_credentials_active_idx
  on public.platform_supplier_credentials (is_active);

comment on table public.platform_supplier_credentials is
  'Platform-owned supplier API credentials. Vendors do not store their own keys.';

alter table public.platform_supplier_credentials enable row level security;

drop policy if exists "platform_supplier_credentials_admin_all"
  on public.platform_supplier_credentials;
create policy "platform_supplier_credentials_admin_all"
  on public.platform_supplier_credentials
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 5) Verification
-- ---------------------------------------------------------------------------
select slug, name, kind, is_active
from public.supplier_providers
order by name;

select count(*) as platform_credential_rows
from public.platform_supplier_credentials;
