-- =============================================================================
-- ensure_products_table_complete.sql (paste-ready)
--
-- Single comprehensive ensure for public.products.
--
-- Partial / drifted live DBs have been missing columns one at a time
-- (compare_at_price, currency, images, …), each causing PostgREST:
--   Could not find the '<column>' column of 'products' in the schema cache
--
-- This migration idempotently creates the table (if absent), adds every
-- column the app + import/checkout flows need with proper types/defaults,
-- applies constraints + indexes, and reloads the schema cache ONCE.
--
-- Supersedes the need to run 050 / 053 / 054 separately on new DBs.
-- Safe to re-run.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0) Enums
-- ---------------------------------------------------------------------------

do $$
begin
  create type public.product_status as enum ('draft', 'active', 'archived');
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.product_type as enum ('physical', 'digital');
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.supplier_provider_kind as enum (
    'dsers',
    'cj_dropshipping',
    'spocket',
    'print_on_demand'
  );
exception
  when duplicate_object then null;
end;
$$;

do $$ begin
  alter type public.supplier_provider_kind add value if not exists 'dsers';
exception when duplicate_object then null; end $$;
do $$ begin
  alter type public.supplier_provider_kind add value if not exists 'cj_dropshipping';
exception when duplicate_object then null; end $$;
do $$ begin
  alter type public.supplier_provider_kind add value if not exists 'spocket';
exception when duplicate_object then null; end $$;
do $$ begin
  alter type public.supplier_provider_kind add value if not exists 'print_on_demand';
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 1) Table shell (create if not exists — will NOT backfill missing columns)
-- ---------------------------------------------------------------------------

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null,
  name text not null,
  slug text not null,
  description text,
  price numeric(12, 2) not null default 0,
  compare_at_price numeric(12, 2),
  currency text not null default 'USDT',
  sku text,
  stock_quantity integer not null default 0,
  images jsonb not null default '[]'::jsonb,
  status public.product_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vendor_id, slug)
);

-- Soft-attach vendors FK when the table exists (partial DBs may lack it).
do $$
begin
  if to_regclass('public.vendors') is not null
     and not exists (
       select 1
       from pg_constraint
       where conname = 'products_vendor_id_fkey'
         and conrelid = 'public.products'::regclass
     ) then
    alter table public.products
      add constraint products_vendor_id_fkey
      foreign key (vendor_id) references public.vendors (id) on delete cascade;
  end if;
exception
  when others then null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) All required / extended columns (idempotent ADD COLUMN IF NOT EXISTS)
-- ---------------------------------------------------------------------------

-- Identity / copy
alter table public.products
  add column if not exists vendor_id uuid;
alter table public.products
  add column if not exists name text;
alter table public.products
  add column if not exists slug text;
alter table public.products
  add column if not exists description text;

-- Pricing (marketplace settles in USDT)
alter table public.products
  add column if not exists price numeric(12, 2) not null default 0;
alter table public.products
  add column if not exists compare_at_price numeric(12, 2);
alter table public.products
  add column if not exists currency text not null default 'USDT';

-- Inventory + media
alter table public.products
  add column if not exists sku text;
alter table public.products
  add column if not exists stock_quantity integer not null default 0;
alter table public.products
  add column if not exists images jsonb not null default '[]'::jsonb;
alter table public.products
  add column if not exists specifications jsonb not null default '[]'::jsonb;

-- Status / type
alter table public.products
  add column if not exists status public.product_status not null default 'draft';
alter table public.products
  add column if not exists product_type public.product_type not null default 'physical';
alter table public.products
  add column if not exists download_url text;
alter table public.products
  add column if not exists download_label text;

-- Timestamps
alter table public.products
  add column if not exists created_at timestamptz not null default now();
alter table public.products
  add column if not exists updated_at timestamptz not null default now();

-- Category (FK only when categories exists)
do $$
begin
  if to_regclass('public.categories') is not null then
    alter table public.products
      add column if not exists category_id uuid
        references public.categories (id) on delete set null;
  else
    alter table public.products
      add column if not exists category_id uuid;
  end if;
end;
$$;

-- Dropship / sourcing
alter table public.products
  add column if not exists is_dropship boolean not null default false;
alter table public.products
  add column if not exists source_product_id uuid;
alter table public.products
  add column if not exists origin_country_code text;
alter table public.products
  add column if not exists origin_region_id uuid;
alter table public.products
  add column if not exists ships_to_region_ids uuid[] not null default '{}'::uuid[];
alter table public.products
  add column if not exists source_provider_slug text;
alter table public.products
  add column if not exists source_provider_kind public.supplier_provider_kind;
alter table public.products
  add column if not exists external_product_id text;

-- Shipping speed tags
alter table public.products
  add column if not exists shipping_speed_tags text[] not null default '{}'::text[];
alter table public.products
  add column if not exists shipping_days_min integer;
alter table public.products
  add column if not exists shipping_days_max integer;

-- Soft FKs for optional related tables
do $$
begin
  if to_regclass('public.sourcing_regions') is not null
     and not exists (
       select 1 from pg_constraint
       where conname = 'products_origin_region_id_fkey'
         and conrelid = 'public.products'::regclass
     ) then
    alter table public.products
      add constraint products_origin_region_id_fkey
      foreign key (origin_region_id)
      references public.sourcing_regions (id) on delete set null;
  end if;
exception when others then null;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'products_source_product_id_fkey'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_source_product_id_fkey
      foreign key (source_product_id)
      references public.products (id) on delete set null;
  end if;
exception when others then null;
end;
$$;

do $$
begin
  if to_regclass('public.supplier_providers') is not null
     and not exists (
       select 1 from pg_constraint
       where conname = 'products_source_provider_slug_fkey'
         and conrelid = 'public.products'::regclass
     ) then
    alter table public.products
      add constraint products_source_provider_slug_fkey
      foreign key (source_provider_slug)
      references public.supplier_providers (slug) on delete set null;
  end if;
exception when others then null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) Defaults + data heal
-- ---------------------------------------------------------------------------

update public.products
set currency = 'USDT'
where currency is distinct from 'USDT';

update public.products
set images = '[]'::jsonb
where images is null;

update public.products
set specifications = '[]'::jsonb
where specifications is null;

update public.products
set ships_to_region_ids = '{}'::uuid[]
where ships_to_region_ids is null;

update public.products
set shipping_speed_tags = '{}'::text[]
where shipping_speed_tags is null;

alter table public.products alter column currency set default 'USDT';
alter table public.products alter column images set default '[]'::jsonb;
alter table public.products alter column specifications set default '[]'::jsonb;
alter table public.products alter column stock_quantity set default 0;
alter table public.products alter column price set default 0;
alter table public.products alter column status set default 'draft'::public.product_status;
alter table public.products alter column product_type set default 'physical'::public.product_type;
alter table public.products alter column is_dropship set default false;
alter table public.products alter column ships_to_region_ids set default '{}'::uuid[];
alter table public.products alter column shipping_speed_tags set default '{}'::text[];
alter table public.products alter column created_at set default now();
alter table public.products alter column updated_at set default now();

-- ---------------------------------------------------------------------------
-- 4) Constraints (idempotent)
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'products_price_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_price_check check (price >= 0);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'products_compare_at_price_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_compare_at_price_check
      check (compare_at_price is null or compare_at_price >= 0);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'products_currency_usdt_only'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_currency_usdt_only check (currency = 'USDT');
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'products_stock_quantity_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_stock_quantity_check check (stock_quantity >= 0);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'products_images_is_array'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_images_is_array
      check (jsonb_typeof(images) = 'array');
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'products_specifications_is_array'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_specifications_is_array
      check (jsonb_typeof(specifications) = 'array');
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'products_shipping_speed_tags_chk'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_shipping_speed_tags_chk
      check (
        shipping_speed_tags <@ array[
          'fast_dispatch',
          'local_warehouse',
          'standard',
          'economy'
        ]::text[]
      );
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) Comments + indexes
-- ---------------------------------------------------------------------------

comment on table public.products is
  'Marketplace listings. Settlement currency is always USDT.';

comment on column public.products.images is
  'Ordered JSON array of product image URLs for storefront galleries.';
comment on column public.products.currency is
  'Marketplace settlement currency. Always USDT.';
comment on column public.products.compare_at_price is
  'Optional list / compare-at price shown as strikethrough on the storefront.';
comment on column public.products.specifications is
  'Ordered list of product attribute key/value pairs for the storefront specs table.';
comment on column public.products.product_type is
  'physical = shippable good with stock; digital = downloadable file/link.';
comment on column public.products.is_dropship is
  'True when this listing is fulfilled via an external supplier import.';
comment on column public.products.source_provider_slug is
  'External source slug: dsers | cj-dropshipping | spocket | printful | printify.';
comment on column public.products.shipping_speed_tags is
  'Tags for delivery-speed filters: fast_dispatch, local_warehouse, standard, economy.';
comment on column public.products.ships_to_region_ids is
  'Empty = no product-level restriction (still subject to vendor ships_to + routes).';

create index if not exists products_vendor_id_idx on public.products (vendor_id);
create index if not exists products_status_idx on public.products (status);
create index if not exists products_product_type_idx on public.products (product_type);
create index if not exists products_category_id_idx on public.products (category_id);
create index if not exists products_is_dropship_idx on public.products (is_dropship);
create index if not exists products_source_provider_slug_idx
  on public.products (source_provider_slug);
create index if not exists products_shipping_speed_tags_gin
  on public.products using gin (shipping_speed_tags);
create index if not exists products_ships_to_region_ids_gin
  on public.products using gin (ships_to_region_ids);

alter table public.products enable row level security;

-- ---------------------------------------------------------------------------
-- 6) Reload PostgREST schema cache once so every new column is visible
-- ---------------------------------------------------------------------------

notify pgrst, 'reload schema';
