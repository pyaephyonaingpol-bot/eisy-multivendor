-- =============================================================================
-- 060_separate_manual_and_cj_product_catalogs.sql
--
-- Split vendor catalog workflows:
--   manual     → vendor-created (and marketplace copies) products
--   cj_import  → listings imported from CJ Dropshipping
--
-- Storefront still reads public.products. CJ-specific metadata lives in
-- public.cj_imported_products so the two workflows never mix in vendor UI.
-- =============================================================================

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'product_catalog_kind'
  ) then
    create type public.product_catalog_kind as enum ('manual', 'cj_import');
  end if;
end;
$$;

alter table public.products
  add column if not exists catalog_kind public.product_catalog_kind;

update public.products
set catalog_kind = 'manual'
where catalog_kind is null;

alter table public.products
  alter column catalog_kind set default 'manual'::public.product_catalog_kind;

do $$
begin
  alter table public.products
    alter column catalog_kind set not null;
exception
  when others then null;
end;
$$;

comment on column public.products.catalog_kind is
  'manual = vendor-managed catalog; cj_import = CJ Dropshipping import workflow.';

create index if not exists products_vendor_catalog_kind_idx
  on public.products (vendor_id, catalog_kind, created_at desc);

create index if not exists products_catalog_kind_status_idx
  on public.products (catalog_kind, status, created_at desc);

-- ---------------------------------------------------------------------------
-- Dedicated CJ import registry (separate from manual catalog management)
-- ---------------------------------------------------------------------------

create table if not exists public.cj_imported_products (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  provider_id uuid references public.supplier_providers (id) on delete set null,
  external_product_id text not null,
  external_variant_id text,
  external_sku text,
  supplier_cost_usdt numeric(12, 2) not null default 0.01
    check (supplier_cost_usdt >= 0),
  source_payload jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id),
  unique (vendor_id, external_product_id)
);

create index if not exists cj_imported_products_vendor_idx
  on public.cj_imported_products (vendor_id, created_at desc);

create index if not exists cj_imported_products_external_idx
  on public.cj_imported_products (external_product_id);

comment on table public.cj_imported_products is
  'CJ Dropshipping imports only. Manual vendor products never appear here.';

drop trigger if exists cj_imported_products_set_updated_at
  on public.cj_imported_products;

do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'set_updated_at'
  ) then
    create trigger cj_imported_products_set_updated_at
      before update on public.cj_imported_products
      for each row execute function public.set_updated_at();
  end if;
end;
$$;

alter table public.cj_imported_products enable row level security;

drop policy if exists "cj_imported_products_owner_select"
  on public.cj_imported_products;
create policy "cj_imported_products_owner_select"
  on public.cj_imported_products for select
  using (public.owns_vendor(vendor_id) or public.is_admin());

drop policy if exists "cj_imported_products_owner_write"
  on public.cj_imported_products;
create policy "cj_imported_products_owner_write"
  on public.cj_imported_products for all
  using (public.owns_vendor(vendor_id) or public.is_admin())
  with check (public.owns_vendor(vendor_id) or public.is_admin());

-- Backfill catalog_kind + cj_imported_products from existing CJ import rows.
do $$
begin
  if to_regclass('public.external_product_imports') is null then
    return;
  end if;

  update public.products p
  set
    catalog_kind = 'cj_import'::public.product_catalog_kind,
    is_dropship = true,
    source_provider_kind = coalesce(
      p.source_provider_kind,
      'cj_dropshipping'::public.supplier_provider_kind
    ),
    updated_at = now()
  from public.external_product_imports epi
  left join public.supplier_providers sp on sp.id = epi.provider_id
  where epi.product_id = p.id
    and (
      sp.kind = 'cj_dropshipping'
      or coalesce(sp.slug, '') ilike '%cj%'
      or coalesce(p.source_provider_kind::text, '') = 'cj_dropshipping'
    );

  insert into public.cj_imported_products (
    vendor_id,
    product_id,
    provider_id,
    external_product_id,
    external_variant_id,
    external_sku,
    supplier_cost_usdt,
    source_payload,
    last_synced_at,
    created_at
  )
  select
    epi.vendor_id,
    epi.product_id,
    epi.provider_id,
    epi.external_product_id,
    epi.external_variant_id,
    epi.external_sku,
    coalesce(nullif(p.price, 0), 0.01),
    coalesce(epi.source_payload, '{}'::jsonb),
    epi.last_synced_at,
    coalesce(epi.created_at, now())
  from public.external_product_imports epi
  join public.products p on p.id = epi.product_id
  left join public.supplier_providers sp on sp.id = epi.provider_id
  where epi.product_id is not null
    and (
      sp.kind = 'cj_dropshipping'
      or coalesce(sp.slug, '') ilike '%cj%'
      or p.catalog_kind = 'cj_import'::public.product_catalog_kind
    )
  on conflict (product_id) do update
    set
      provider_id = excluded.provider_id,
      external_product_id = excluded.external_product_id,
      external_variant_id = excluded.external_variant_id,
      external_sku = excluded.external_sku,
      source_payload = excluded.source_payload,
      last_synced_at = excluded.last_synced_at,
      updated_at = now();
exception
  when others then
    raise notice 'cj import backfill skipped: %', sqlerrm;
end;
$$;

-- Convenience views for clean workflows (read-only listing surfaces).
create or replace view public.manual_products as
select *
from public.products
where catalog_kind = 'manual'::public.product_catalog_kind;

create or replace view public.cj_products as
select
  p.*,
  c.id as cj_import_id,
  c.external_product_id as cj_external_product_id,
  c.external_variant_id as cj_external_variant_id,
  c.external_sku as cj_external_sku,
  c.supplier_cost_usdt,
  c.last_synced_at as cj_last_synced_at
from public.products p
join public.cj_imported_products c on c.product_id = p.id
where p.catalog_kind = 'cj_import'::public.product_catalog_kind;

comment on view public.manual_products is
  'Vendor-managed products only (excludes CJ Dropshipping imports).';
comment on view public.cj_products is
  'CJ Dropshipping imported products with import metadata.';

grant select on public.manual_products to authenticated, anon;
grant select on public.cj_products to authenticated, anon;

notify pgrst, 'reload schema';
