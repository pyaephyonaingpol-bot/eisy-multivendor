-- Multi-vendor e-commerce schema for Supabase (PostgreSQL)
-- Run in: Dashboard → SQL Editor (paste entire file), or `supabase db push`
--
-- Tables: profiles, vendors, products, orders, order_items, shipping_zones, subscriptions
-- Safe to re-run only on a fresh project; drop objects first if re-applying.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.user_role as enum ('customer', 'vendor', 'admin');
create type public.vendor_status as enum ('pending', 'approved', 'suspended', 'rejected');
create type public.product_status as enum ('draft', 'active', 'archived');
create type public.order_status as enum (
  'pending',
  'paid',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'refunded'
);
create type public.payment_status as enum ('pending', 'paid', 'failed', 'refunded');
create type public.subscription_plan as enum ('free', 'starter', 'pro', 'enterprise');
create type public.subscription_status as enum (
  'trialing',
  'active',
  'past_due',
  'canceled',
  'expired'
);

-- ---------------------------------------------------------------------------
-- profiles — public profile linked to auth.users
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text,
  avatar_url text,
  phone text,
  role public.user_role not null default 'customer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_role_idx on public.profiles (role);

-- ---------------------------------------------------------------------------
-- vendors — one store per owner (extend later if needed)
-- ---------------------------------------------------------------------------

create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete restrict,
  name text not null,
  slug text not null unique,
  description text,
  logo_url text,
  banner_url text,
  status public.vendor_status not null default 'pending',
  commission_rate numeric(5, 2) not null default 10.00
    check (commission_rate >= 0 and commission_rate <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index vendors_owner_id_idx on public.vendors (owner_id);
create index vendors_status_idx on public.vendors (status);

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------

create table public.products (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors (id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  price numeric(12, 2) not null check (price >= 0),
  compare_at_price numeric(12, 2) check (compare_at_price is null or compare_at_price >= 0),
  currency text not null default 'USD',
  sku text,
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  images jsonb not null default '[]'::jsonb,
  status public.product_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vendor_id, slug)
);

create index products_vendor_id_idx on public.products (vendor_id);
create index products_status_idx on public.products (status);

-- ---------------------------------------------------------------------------
-- shipping_zones — per-vendor shipping regions and flat rates
-- ---------------------------------------------------------------------------

create table public.shipping_zones (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors (id) on delete cascade,
  name text not null,
  countries text[] not null default '{}'::text[],
  regions text[] not null default '{}'::text[],
  min_order_amount numeric(12, 2) not null default 0 check (min_order_amount >= 0),
  flat_rate numeric(12, 2) not null default 0 check (flat_rate >= 0),
  estimated_days_min integer check (estimated_days_min is null or estimated_days_min >= 0),
  estimated_days_max integer check (
    estimated_days_max is null
    or estimated_days_min is null
    or estimated_days_max >= estimated_days_min
  ),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index shipping_zones_vendor_id_idx on public.shipping_zones (vendor_id);
create index shipping_zones_is_active_idx on public.shipping_zones (is_active);

-- ---------------------------------------------------------------------------
-- orders — one order per vendor (split checkout can create multiple rows)
-- ---------------------------------------------------------------------------

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles (id) on delete restrict,
  vendor_id uuid not null references public.vendors (id) on delete restrict,
  status public.order_status not null default 'pending',
  payment_status public.payment_status not null default 'pending',
  subtotal numeric(12, 2) not null default 0 check (subtotal >= 0),
  tax numeric(12, 2) not null default 0 check (tax >= 0),
  shipping_fee numeric(12, 2) not null default 0 check (shipping_fee >= 0),
  shipping_zone_id uuid references public.shipping_zones (id) on delete set null,
  total numeric(12, 2) not null default 0 check (total >= 0),
  currency text not null default 'USD',
  shipping_address jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index orders_customer_id_idx on public.orders (customer_id);
create index orders_vendor_id_idx on public.orders (vendor_id);
create index orders_status_idx on public.orders (status);
create index orders_shipping_zone_id_idx on public.orders (shipping_zone_id);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  product_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  total_price numeric(12, 2) not null check (total_price >= 0),
  created_at timestamptz not null default now()
);

create index order_items_order_id_idx on public.order_items (order_id);
create index order_items_product_id_idx on public.order_items (product_id);

-- ---------------------------------------------------------------------------
-- subscriptions — vendor platform plans (Stripe id optional)
-- ---------------------------------------------------------------------------

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  vendor_id uuid references public.vendors (id) on delete set null,
  plan public.subscription_plan not null default 'free',
  status public.subscription_status not null default 'active',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  stripe_subscription_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscriptions_user_id_idx on public.subscriptions (user_id);
create index subscriptions_vendor_id_idx on public.subscriptions (vendor_id);
create index subscriptions_status_idx on public.subscriptions (status);

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger vendors_set_updated_at
  before update on public.vendors
  for each row execute function public.set_updated_at();

create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

create trigger shipping_zones_set_updated_at
  before update on public.shipping_zones
  for each row execute function public.set_updated_at();

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Helpers for RLS
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

create or replace function public.owns_vendor(p_vendor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.vendors v
    where v.id = p_vendor_id and v.owner_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Create public.profiles when a row is inserted into auth.users
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text := coalesce(new.raw_user_meta_data->>'role', 'customer');
  assigned_role public.user_role := 'customer';
begin
  -- Only customer | vendor may be chosen at signup. Never trust client "admin".
  if requested_role = 'vendor' then
    assigned_role := 'vendor';
  end if;

  insert into public.profiles (id, email, full_name, avatar_url, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url',
    assigned_role
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Prevent non-admins from changing their own role
-- ---------------------------------------------------------------------------

create or replace function public.protect_profile_role()
returns trigger
language plpgsql
as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Only admins can change roles';
  end if;
  return new;
end;
$$;

create trigger profiles_protect_role
  before update on public.profiles
  for each row execute function public.protect_profile_role();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.vendors enable row level security;
alter table public.products enable row level security;
alter table public.shipping_zones enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.subscriptions enable row level security;

-- profiles
create policy "profiles_select_own_or_admin"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin());

create policy "profiles_update_own_or_admin"
  on public.profiles for update
  using (auth.uid() = id or public.is_admin())
  with check (auth.uid() = id or public.is_admin());

-- vendors
create policy "vendors_select_approved_owner_or_admin"
  on public.vendors for select
  using (status = 'approved' or owner_id = auth.uid() or public.is_admin());

create policy "vendors_insert_owner"
  on public.vendors for insert
  with check (owner_id = auth.uid() or public.is_admin());

create policy "vendors_update_owner_or_admin"
  on public.vendors for update
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());

-- products
create policy "products_select_active_owner_or_admin"
  on public.products for select
  using (
    status = 'active'
    or public.owns_vendor(vendor_id)
    or public.is_admin()
  );

create policy "products_insert_owner"
  on public.products for insert
  with check (public.owns_vendor(vendor_id) or public.is_admin());

create policy "products_update_owner_or_admin"
  on public.products for update
  using (public.owns_vendor(vendor_id) or public.is_admin());

create policy "products_delete_owner_or_admin"
  on public.products for delete
  using (public.owns_vendor(vendor_id) or public.is_admin());

-- shipping_zones
create policy "shipping_zones_select_active_owner_or_admin"
  on public.shipping_zones for select
  using (
    is_active = true
    or public.owns_vendor(vendor_id)
    or public.is_admin()
  );

create policy "shipping_zones_insert_owner"
  on public.shipping_zones for insert
  with check (public.owns_vendor(vendor_id) or public.is_admin());

create policy "shipping_zones_update_owner_or_admin"
  on public.shipping_zones for update
  using (public.owns_vendor(vendor_id) or public.is_admin())
  with check (public.owns_vendor(vendor_id) or public.is_admin());

create policy "shipping_zones_delete_owner_or_admin"
  on public.shipping_zones for delete
  using (public.owns_vendor(vendor_id) or public.is_admin());

-- orders
create policy "orders_select_customer_vendor_or_admin"
  on public.orders for select
  using (
    customer_id = auth.uid()
    or public.owns_vendor(vendor_id)
    or public.is_admin()
  );

create policy "orders_insert_customer"
  on public.orders for insert
  with check (customer_id = auth.uid() or public.is_admin());

create policy "orders_update_customer_vendor_or_admin"
  on public.orders for update
  using (
    customer_id = auth.uid()
    or public.owns_vendor(vendor_id)
    or public.is_admin()
  );

-- order_items
create policy "order_items_select_via_order"
  on public.order_items for select
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and (
          o.customer_id = auth.uid()
          or public.owns_vendor(o.vendor_id)
          or public.is_admin()
        )
    )
  );

create policy "order_items_insert_customer"
  on public.order_items for insert
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_id and (o.customer_id = auth.uid() or public.is_admin())
    )
  );

-- subscriptions
create policy "subscriptions_select_own_or_admin"
  on public.subscriptions for select
  using (user_id = auth.uid() or public.is_admin());

create policy "subscriptions_insert_own"
  on public.subscriptions for insert
  with check (user_id = auth.uid() or public.is_admin());

create policy "subscriptions_update_own_or_admin"
  on public.subscriptions for update
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());
