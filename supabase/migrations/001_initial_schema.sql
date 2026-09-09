-- Multi-vendor e-commerce schema for Supabase (PostgreSQL)
-- Run in: Dashboard → SQL Editor, or `supabase db push`

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
-- users — profile row linked to auth.users
-- ---------------------------------------------------------------------------

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text,
  avatar_url text,
  phone text,
  role public.user_role not null default 'customer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index users_role_idx on public.users (role);

-- ---------------------------------------------------------------------------
-- vendors — one store per owner (extend later if needed)
-- ---------------------------------------------------------------------------

create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users (id) on delete restrict,
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
-- orders — one order per vendor (split checkout can create multiple rows)
-- ---------------------------------------------------------------------------

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.users (id) on delete restrict,
  vendor_id uuid not null references public.vendors (id) on delete restrict,
  status public.order_status not null default 'pending',
  payment_status public.payment_status not null default 'pending',
  subtotal numeric(12, 2) not null default 0 check (subtotal >= 0),
  tax numeric(12, 2) not null default 0 check (tax >= 0),
  shipping_fee numeric(12, 2) not null default 0 check (shipping_fee >= 0),
  total numeric(12, 2) not null default 0 check (total >= 0),
  currency text not null default 'USD',
  shipping_address jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index orders_customer_id_idx on public.orders (customer_id);
create index orders_vendor_id_idx on public.orders (vendor_id);
create index orders_status_idx on public.orders (status);

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
  user_id uuid not null references public.users (id) on delete cascade,
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

create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

create trigger vendors_set_updated_at
  before update on public.vendors
  for each row execute function public.set_updated_at();

create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Create public.users when a row is inserted into auth.users
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, full_name, avatar_url, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url',
    coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'customer')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.users enable row level security;
alter table public.vendors enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.subscriptions enable row level security;

-- users
create policy "users_select_own"
  on public.users for select
  using (auth.uid() = id);

create policy "users_update_own"
  on public.users for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- vendors
create policy "vendors_select_approved_or_owner"
  on public.vendors for select
  using (status = 'approved' or owner_id = auth.uid());

create policy "vendors_insert_owner"
  on public.vendors for insert
  with check (owner_id = auth.uid());

create policy "vendors_update_owner"
  on public.vendors for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- products
create policy "products_select_active_or_owner"
  on public.products for select
  using (
    status = 'active'
    or exists (
      select 1 from public.vendors v
      where v.id = products.vendor_id and v.owner_id = auth.uid()
    )
  );

create policy "products_insert_owner"
  on public.products for insert
  with check (
    exists (
      select 1 from public.vendors v
      where v.id = vendor_id and v.owner_id = auth.uid()
    )
  );

create policy "products_update_owner"
  on public.products for update
  using (
    exists (
      select 1 from public.vendors v
      where v.id = products.vendor_id and v.owner_id = auth.uid()
    )
  );

create policy "products_delete_owner"
  on public.products for delete
  using (
    exists (
      select 1 from public.vendors v
      where v.id = products.vendor_id and v.owner_id = auth.uid()
    )
  );

-- orders
create policy "orders_select_customer_or_vendor"
  on public.orders for select
  using (
    customer_id = auth.uid()
    or exists (
      select 1 from public.vendors v
      where v.id = orders.vendor_id and v.owner_id = auth.uid()
    )
  );

create policy "orders_insert_customer"
  on public.orders for insert
  with check (customer_id = auth.uid());

create policy "orders_update_customer_or_vendor"
  on public.orders for update
  using (
    customer_id = auth.uid()
    or exists (
      select 1 from public.vendors v
      where v.id = orders.vendor_id and v.owner_id = auth.uid()
    )
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
          or exists (
            select 1 from public.vendors v
            where v.id = o.vendor_id and v.owner_id = auth.uid()
          )
        )
    )
  );

create policy "order_items_insert_customer"
  on public.order_items for insert
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_id and o.customer_id = auth.uid()
    )
  );

-- subscriptions
create policy "subscriptions_select_own"
  on public.subscriptions for select
  using (user_id = auth.uid());

create policy "subscriptions_insert_own"
  on public.subscriptions for insert
  with check (user_id = auth.uid());

create policy "subscriptions_update_own"
  on public.subscriptions for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
