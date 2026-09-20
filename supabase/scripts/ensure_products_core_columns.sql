-- =============================================================================
-- ensure_products_core_columns.sql
--
-- Paste-ready: ensure public.products has images, currency, compare_at_price,
-- and the other columns used by create/import, then reload PostgREST schema.
-- Fixes errors like:
--   Could not find the 'images' column of 'products' in the schema cache
-- =============================================================================

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

update public.products
set currency = 'USDT'
where currency is distinct from 'USDT';

alter table public.products
  alter column currency set default 'USDT';

alter table public.products
  alter column images set default '[]'::jsonb;

alter table public.products
  alter column stock_quantity set default 0;

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

notify pgrst, 'reload schema';
