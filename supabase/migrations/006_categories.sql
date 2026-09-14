-- Marketplace categories + optional product.category_id FK.

create table public.categories (
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

create unique index categories_slug_key on public.categories (slug);
create index categories_active_sort_idx
  on public.categories (is_active, sort_order, name);

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

alter table public.products
  add column if not exists category_id uuid references public.categories (id) on delete set null;

create index if not exists products_category_id_idx on public.products (category_id);

alter table public.categories enable row level security;

-- Anyone (including anon storefront) can read active categories.
create policy "categories_select_active_or_admin"
  on public.categories for select
  using (is_active = true or public.is_admin());

-- Only admins manage the taxonomy.
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

-- Seed a few starter categories so the vendor dropdown is useful out of the box.
insert into public.categories (name, slug, description, sort_order)
values
  ('Electronics', 'electronics', 'Gadgets, accessories, and devices', 10),
  ('Fashion', 'fashion', 'Apparel and wearables', 20),
  ('Home & Living', 'home-living', 'Furniture, decor, and household goods', 30),
  ('Digital Goods', 'digital-goods', 'Downloads, templates, and software', 40),
  ('Other', 'other', 'Uncategorized marketplace items', 100)
on conflict (slug) do nothing;
