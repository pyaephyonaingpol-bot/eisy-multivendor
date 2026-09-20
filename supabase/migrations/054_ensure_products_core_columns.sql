-- =============================================================================
-- 054_ensure_products_core_columns.sql
--
-- Partial live DBs keep missing base `products` columns that create table if
-- not exists will not backfill. Imports then fail with PostgREST errors like:
--   Could not find the 'images' column of 'products' in the schema cache
--   Could not find the 'currency' column of 'products' in the schema cache
--   Could not find the 'compare_at_price' column of 'products' in the schema cache
--
-- Idempotently ensure every column used by product create / supplier import,
-- then reload the PostgREST schema cache.
-- =============================================================================
-- NOTE: Prefer 055_ensure_products_table_complete.sql (or the paste script
-- ensure_products_table_complete.sql) for a single all-columns ensure +
-- one schema-cache reload. This file remains for already-applied DBs.
--

-- ---------------------------------------------------------------------------
-- 0) Enums used by product columns (no-op when already present)
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

-- ---------------------------------------------------------------------------
-- 1) Core catalog columns (from 001 / import + vendor product forms)
-- ---------------------------------------------------------------------------

alter table public.products
  add column if not exists description text;

alter table public.products
  add column if not exists price numeric(12, 2);

alter table public.products
  add column if not exists compare_at_price numeric(12, 2);

alter table public.products
  add column if not exists currency text not null default 'USDT';

alter table public.products
  add column if not exists sku text;

alter table public.products
  add column if not exists stock_quantity integer not null default 0;

alter table public.products
  add column if not exists images jsonb not null default '[]'::jsonb;

alter table public.products
  add column if not exists status public.product_status not null default 'draft';

alter table public.products
  add column if not exists created_at timestamptz not null default now();

alter table public.products
  add column if not exists updated_at timestamptz not null default now();

-- Heal currency before check constraint (matches 010 / 053).
update public.products
set currency = 'USDT'
where currency is distinct from 'USDT';

alter table public.products
  alter column currency set default 'USDT';

alter table public.products
  alter column images set default '[]'::jsonb;

alter table public.products
  alter column stock_quantity set default 0;

-- ---------------------------------------------------------------------------
-- 2) Extended product columns used by create/edit + dropship
-- ---------------------------------------------------------------------------

alter table public.products
  add column if not exists specifications jsonb not null default '[]'::jsonb;

alter table public.products
  alter column specifications set default '[]'::jsonb;

alter table public.products
  add column if not exists product_type public.product_type not null default 'physical';

alter table public.products
  add column if not exists download_url text;

alter table public.products
  add column if not exists download_label text;

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
  alter column ships_to_region_ids set default '{}'::uuid[];

-- category_id only when categories exists (partial DBs may lack it).
do $$
begin
  if to_regclass('public.categories') is not null then
    alter table public.products
      add column if not exists category_id uuid references public.categories (id) on delete set null;
  else
    alter table public.products
      add column if not exists category_id uuid;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) Constraints (idempotent)
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from pg_constraint
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
    select 1
    from pg_constraint
    where conname = 'products_currency_usdt_only'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_currency_usdt_only
      check (currency = 'USDT');
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_stock_quantity_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_stock_quantity_check
      check (stock_quantity >= 0);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
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
    select 1
    from pg_constraint
    where conname = 'products_specifications_is_array'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_specifications_is_array
      check (jsonb_typeof(specifications) = 'array');
  end if;
end;
$$;

comment on column public.products.images is
  'Ordered JSON array of product image URLs for storefront galleries.';

comment on column public.products.currency is
  'Marketplace settlement currency. Always USDT.';

comment on column public.products.compare_at_price is
  'Optional list / compare-at price shown as strikethrough on the storefront.';

comment on column public.products.specifications is
  'Ordered list of product attribute key/value pairs for the storefront specs table.';

create index if not exists products_status_idx on public.products (status);
create index if not exists products_product_type_idx on public.products (product_type);
create index if not exists products_category_id_idx on public.products (category_id);

-- Reload PostgREST schema cache so new columns are visible immediately.
notify pgrst, 'reload schema';
