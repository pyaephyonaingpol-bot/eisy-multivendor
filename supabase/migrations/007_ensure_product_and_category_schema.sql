-- Idempotent ensure: digital/physical product columns + categories taxonomy.
-- Safe to re-run in the Supabase SQL editor if earlier migrations were skipped.

-- ---------------------------------------------------------------------------
-- 1) Product type enum + digital/physical columns on products
-- ---------------------------------------------------------------------------

do $$
begin
  create type public.product_type as enum ('physical', 'digital');
exception
  when duplicate_object then null;
end $$;

alter table public.products
  add column if not exists product_type public.product_type not null default 'physical',
  add column if not exists download_url text,
  add column if not exists download_label text;

-- Physical inventory + compare-at columns from initial schema; add only if a
-- partial DB is missing them (create table if not exists will not backfill).
alter table public.products
  add column if not exists stock_quantity integer not null default 0;

alter table public.products
  add column if not exists compare_at_price numeric(12, 2);

comment on column public.products.product_type is
  'physical = shippable good with stock; digital = downloadable file/link';

comment on column public.products.download_url is
  'HTTPS URL or storage path for digital product delivery';

comment on column public.products.download_label is
  'Optional display name for the digital download (e.g. filename)';

create index if not exists products_product_type_idx
  on public.products (product_type);

create or replace function public.normalize_product_inventory()
returns trigger
language plpgsql
as $$
begin
  if new.product_type = 'digital' then
    new.stock_quantity := 0;
    new.download_url := nullif(trim(new.download_url), '');
    new.download_label := nullif(trim(new.download_label), '');
  else
    new.download_url := null;
    new.download_label := null;
  end if;
  return new;
end;
$$;

drop trigger if exists products_normalize_inventory on public.products;

create trigger products_normalize_inventory
  before insert or update on public.products
  for each row execute function public.normalize_product_inventory();

-- ---------------------------------------------------------------------------
-- 2) Categories table + products.category_id FK
-- Column is is_active (not "active") to match app code.
-- ---------------------------------------------------------------------------

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_name_nonempty check (char_length(trim(name)) > 0),
  constraint categories_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

-- If an older draft table used "active", rename it.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'categories'
      and column_name = 'active'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'categories'
      and column_name = 'is_active'
  ) then
    alter table public.categories rename column active to is_active;
  end if;
end $$;

alter table public.categories
  add column if not exists name text,
  add column if not exists slug text,
  add column if not exists description text,
  add column if not exists sort_order integer not null default 0,
  add column if not exists is_active boolean not null default true,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists categories_slug_key on public.categories (slug);
create index if not exists categories_active_sort_idx
  on public.categories (is_active, sort_order, name);

drop trigger if exists categories_set_updated_at on public.categories;

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

alter table public.products
  add column if not exists category_id uuid references public.categories (id) on delete set null;

create index if not exists products_category_id_idx on public.products (category_id);

alter table public.categories enable row level security;

drop policy if exists "categories_select_active_or_admin" on public.categories;
drop policy if exists "categories_insert_admin" on public.categories;
drop policy if exists "categories_update_admin" on public.categories;
drop policy if exists "categories_delete_admin" on public.categories;

create policy "categories_select_active_or_admin"
  on public.categories for select
  using (is_active = true or public.is_admin());

create policy "categories_insert_admin"
  on public.categories for insert
  with check (public.is_admin());

create policy "categories_update_admin"
  on public.categories for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "categories_delete_admin"
  on public.categories for delete
  using (public.is_admin());

insert into public.categories (name, slug, description, sort_order)
values
  ('Electronics', 'electronics', 'Gadgets, accessories, and devices', 10),
  ('Fashion', 'fashion', 'Apparel and wearables', 20),
  ('Home & Living', 'home-living', 'Furniture, decor, and household goods', 30),
  ('Digital Goods', 'digital-goods', 'Downloads, templates, and software', 40),
  ('Other', 'other', 'Uncategorized marketplace items', 100)
on conflict (slug) do nothing;

-- Refresh PostgREST schema cache so the API sees new columns immediately.
notify pgrst, 'reload schema';
