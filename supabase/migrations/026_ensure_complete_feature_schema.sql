-- =============================================================================
-- 026_ensure_complete_feature_schema.sql
--
-- Complete feature schema ensure for Eisy Myanmar (Supabase / PostgreSQL).
-- Idempotent: safe to run after migrations 001–025.
--
-- Maps the product model to actual tables:
--   1) "users"           → public.profiles  (FK to auth.users)
--      role              → profiles.role: customer | vendor | admin
--                          (buyer = customer; dropshipper = vendor with
--                           products.is_dropship = true — no separate table)
--      location/region   → profiles.preferred_region_id, preferred_country_code
--      KYC               → vendors.kyc_status (seller KYC, not on profiles)
--
--   2) "vendors/dropshippers" → public.vendors (shared row for both)
--      shipping regions  → vendors.ships_to_region_ids uuid[]
--      store name/slug   → vendors.name, vendors.slug
--
--   3) products          → public.products (+ supplier route / import tables)
--      source origin     → products.source_provider_slug + supplier_providers
--      inventory         → products.stock_quantity
--      shipping speed    → products.shipping_speed_tags text[]
--
--   4) orders + escrow   → public.orders + public.order_escrow_ledger
--      compatibility view public.escrow_transactions → order_escrow_ledger
--      3% commission     → dropship_fee_settings.commission_rate (default 0.03)
--      payout states     → orders.payout_status: held | released | not_applicable
--
--   5) RLS               → own-or-admin / public-active / RPC-only money paths
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 0) Helper predicates (required by RLS)
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

create or replace function public.is_service_role()
returns boolean
language sql
stable
as $$
  select coalesce(
    current_setting('request.jwt.claim.role', true),
    current_setting('request.jwt.claims', true)::jsonb ->> 'role',
    ''
  ) = 'service_role';
$$;

-- ---------------------------------------------------------------------------
-- 1) Enums
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.user_role as enum ('customer', 'vendor', 'admin');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.vendor_status as enum ('pending', 'approved', 'suspended', 'rejected');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.product_status as enum ('draft', 'active', 'archived');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.order_status as enum (
    'pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.payment_status as enum ('pending', 'paid', 'failed', 'refunded');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.order_payout_status as enum ('held', 'released', 'not_applicable');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.order_escrow_role as enum ('supplier', 'seller', 'platform');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.vendor_kyc_status as enum (
    'unsubmitted', 'pending', 'approved', 'rejected'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.supplier_provider_kind as enum (
    'cj_dropshipping',
    'dsers',
    'spocket',
    'print_on_demand',
    'warehouse',
    'other'
  );
exception when duplicate_object then null;
end $$;

-- Extend provider kind with spocket if an older enum already existed without it.
do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'supplier_provider_kind'
      and e.enumlabel = 'spocket'
  ) then
    alter type public.supplier_provider_kind add value 'spocket';
  end if;
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- 2) profiles (= app "users") — role + buyer location/region
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text,
  avatar_url text,
  phone text,
  role public.user_role not null default 'customer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists preferred_region_id uuid;

alter table public.profiles
  add column if not exists preferred_country_code text;

comment on table public.profiles is
  'App user profile (auth.users). Role: customer (=buyer), vendor, admin. Dropshipper is not a role — it is a vendor with dropship products.';
comment on column public.profiles.preferred_region_id is
  'Buyer preferred sourcing_regions.id for catalog filtering.';
comment on column public.profiles.preferred_country_code is
  'ISO country code used to resolve sourcing region (e.g. MM, TH, US).';

create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists profiles_preferred_region_id_idx
  on public.profiles (preferred_region_id);

-- ---------------------------------------------------------------------------
-- 3) sourcing_regions — buyer/seller region catalog
-- ---------------------------------------------------------------------------

create table if not exists public.sourcing_regions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  country_codes text[] not null default '{}'::text[],
  is_default boolean not null default false,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.sourcing_regions (code, name, country_codes, is_default, sort_order)
values
  ('MM', 'Myanmar', array['MM'], true, 10),
  ('SEA', 'Southeast Asia', array['TH','SG','MY','ID','VN','PH','KH','LA'], false, 20),
  ('CN', 'China / East Asia', array['CN','HK','TW','JP','KR'], false, 30),
  ('EU', 'Europe', array['DE','FR','IT','ES','NL','BE','AT','PL','SE','IE'], false, 40),
  ('US', 'North America', array['US','CA','MX'], false, 50),
  ('GLOBAL', 'Rest of world', '{}'::text[], false, 90)
on conflict (code) do update
set
  name = excluded.name,
  country_codes = excluded.country_codes,
  is_active = true,
  updated_at = now();

-- FK for preferred region (added after sourcing_regions exists)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_preferred_region_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_preferred_region_id_fkey
      foreign key (preferred_region_id)
      references public.sourcing_regions (id)
      on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4) vendors (= vendors + dropshippers) — store + shipping regions + KYC
-- ---------------------------------------------------------------------------

create table if not exists public.vendors (
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

alter table public.vendors
  add column if not exists ships_to_region_ids uuid[] not null default '{}'::uuid[];

alter table public.vendors
  add column if not exists max_import_items_override integer;

alter table public.vendors
  add column if not exists kyc_status public.vendor_kyc_status not null default 'unsubmitted';

alter table public.vendors
  add column if not exists kyc_document_type text;

alter table public.vendors
  add column if not exists kyc_document_url text;

alter table public.vendors
  add column if not exists kyc_document_path text;

alter table public.vendors
  add column if not exists kyc_legal_name text;

alter table public.vendors
  add column if not exists kyc_document_number text;

alter table public.vendors
  add column if not exists kyc_submitted_at timestamptz;

alter table public.vendors
  add column if not exists kyc_reviewed_at timestamptz;

alter table public.vendors
  add column if not exists kyc_reviewed_by uuid references auth.users (id) on delete set null;

alter table public.vendors
  add column if not exists kyc_rejection_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'vendors_kyc_document_type_chk'
  ) then
    alter table public.vendors
      add constraint vendors_kyc_document_type_chk
      check (
        kyc_document_type is null
        or kyc_document_type in ('passport', 'national_id', 'trade_license')
      );
  end if;
end $$;

comment on table public.vendors is
  'Seller store for vendors and dropshippers. Dropshipper = same row with is_dropship products.';
comment on column public.vendors.ships_to_region_ids is
  'Empty = worldwide. Non-empty = only these sourcing_regions can see/buy listings.';
comment on column public.vendors.kyc_status is
  'Seller KYC. approved required to publish active products and withdraw funds.';

create index if not exists vendors_owner_id_idx on public.vendors (owner_id);
create index if not exists vendors_status_idx on public.vendors (status);
create index if not exists vendors_kyc_status_idx on public.vendors (kyc_status);
create index if not exists vendors_ships_to_region_ids_gin
  on public.vendors using gin (ships_to_region_ids);

-- ---------------------------------------------------------------------------
-- 5) supplier_providers — DSers, CJ, Spocket, POD
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

insert into public.supplier_providers (
  slug, name, kind, default_origin_country, supports_regions, notes, is_active
)
values
  ('cj-dropshipping', 'CJ Dropshipping', 'cj_dropshipping', 'CN',
    array['MM','SEA','CN','EU','US','GLOBAL'], 'China warehouse dropship.', true),
  ('dsers', 'DSers (AliExpress)', 'dsers', 'CN',
    array['MM','SEA','CN','EU','US','GLOBAL'], 'AliExpress via DSers.', true),
  ('spocket', 'Spocket', 'spocket', 'US',
    array['US','EU','SEA','GLOBAL','MM'], 'US/EU faster lanes.', true),
  ('printful', 'Printful (POD)', 'print_on_demand', 'US',
    array['US','EU','GLOBAL'], 'Print-on-demand apparel.', true),
  ('printify', 'Printify (POD)', 'print_on_demand', 'US',
    array['US','EU','GLOBAL'], 'Print-on-demand network.', true)
on conflict (slug) do update
set
  name = excluded.name,
  kind = excluded.kind,
  default_origin_country = excluded.default_origin_country,
  supports_regions = excluded.supports_regions,
  notes = excluded.notes,
  is_active = true,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- 6) products — seller link, inventory, source origin, shipping speed tags
-- ---------------------------------------------------------------------------

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors (id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  price numeric(12, 2) not null check (price >= 0),
  compare_at_price numeric(12, 2)
    check (compare_at_price is null or compare_at_price >= 0),
  currency text not null default 'USDT',
  sku text,
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  images jsonb not null default '[]'::jsonb,
  status public.product_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vendor_id, slug)
);

alter table public.products
  add column if not exists is_dropship boolean not null default false;

alter table public.products
  add column if not exists source_product_id uuid references public.products (id) on delete set null;

alter table public.products
  add column if not exists origin_country_code text;

alter table public.products
  add column if not exists origin_region_id uuid references public.sourcing_regions (id) on delete set null;

alter table public.products
  add column if not exists ships_to_region_ids uuid[] not null default '{}'::uuid[];

-- Source origin for multi-supplier catalog (DSers / CJ / Spocket / POD)
alter table public.products
  add column if not exists source_provider_slug text;

alter table public.products
  add column if not exists source_provider_kind public.supplier_provider_kind;

alter table public.products
  add column if not exists external_product_id text;

-- Shipping speed tags for storefront / sourcing filters
-- e.g. {'fast_dispatch','local_warehouse'}
alter table public.products
  add column if not exists shipping_speed_tags text[] not null default '{}'::text[];

alter table public.products
  add column if not exists shipping_days_min integer;

alter table public.products
  add column if not exists shipping_days_max integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'products_shipping_speed_tags_chk'
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
end $$;

comment on column public.products.source_provider_slug is
  'External source slug: dsers | cj-dropshipping | spocket | printful | printify.';
comment on column public.products.shipping_speed_tags is
  'Tags for delivery-speed filters: fast_dispatch, local_warehouse, standard, economy.';
comment on column public.products.ships_to_region_ids is
  'Empty = no product-level restriction (still subject to vendor ships_to + routes).';

create index if not exists products_vendor_id_idx on public.products (vendor_id);
create index if not exists products_status_idx on public.products (status);
create index if not exists products_is_dropship_idx on public.products (is_dropship);
create index if not exists products_source_provider_slug_idx
  on public.products (source_provider_slug);
create index if not exists products_shipping_speed_tags_gin
  on public.products using gin (shipping_speed_tags);
create index if not exists products_ships_to_region_ids_gin
  on public.products using gin (ships_to_region_ids);

-- Optional FK to supplier_providers.slug
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'products_source_provider_slug_fkey'
  ) then
    alter table public.products
      add constraint products_source_provider_slug_fkey
      foreign key (source_provider_slug)
      references public.supplier_providers (slug)
      on delete set null;
  end if;
exception when others then
  -- Ignore if slug FK cannot be added mid-flight (e.g. orphan values)
  null;
end $$;

-- Compatibility view: "dropshippers" as vendors that own dropship products
-- (created after products.is_dropship exists)
create or replace view public.dropshippers
with (security_invoker = true)
as
select v.*
from public.vendors v
where exists (
  select 1
  from public.products p
  where p.vendor_id = v.id
    and coalesce(p.is_dropship, false) = true
);

comment on view public.dropshippers is
  'Convenience view over vendors that have at least one is_dropship product.';

-- ---------------------------------------------------------------------------
-- 7) product_supplier_routes — per-region fulfillment routing
-- ---------------------------------------------------------------------------

create table if not exists public.product_supplier_routes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  region_id uuid not null references public.sourcing_regions (id) on delete cascade,
  provider_id uuid references public.supplier_providers (id) on delete set null,
  external_sku text,
  warehouse_country text,
  shipping_days_min integer,
  shipping_days_max integer,
  shipping_cost_usdt numeric(18, 6) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, region_id, provider_id)
);

create index if not exists product_supplier_routes_product_id_idx
  on public.product_supplier_routes (product_id);

-- ---------------------------------------------------------------------------
-- 8) wallets + transactions (escrow balance)
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.wallet_currency as enum ('USDT', 'MMK');
exception when duplicate_object then null;
end $$;

create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  currency public.wallet_currency not null default 'USDT',
  available_balance numeric(18, 6) not null default 0 check (available_balance >= 0),
  pending_balance numeric(18, 6) not null default 0 check (pending_balance >= 0),
  escrow_balance numeric(18, 6) not null default 0 check (escrow_balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, currency)
);

comment on column public.wallets.escrow_balance is
  'Sale proceeds held until order delivered. Not withdrawable.';

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets (id) on delete cascade,
  type text not null,
  amount numeric(18, 6) not null,
  balance_after numeric(18, 6),
  reference_type text,
  reference_id uuid,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists wallets_user_id_idx on public.wallets (user_id);
create index if not exists wallet_transactions_wallet_id_idx
  on public.wallet_transactions (wallet_id);

-- ---------------------------------------------------------------------------
-- 9) orders — delivery tracking + payout / commission state
-- ---------------------------------------------------------------------------

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text,
  customer_id uuid not null references public.profiles (id) on delete restrict,
  vendor_id uuid references public.vendors (id) on delete restrict,
  status public.order_status not null default 'pending',
  payment_status public.payment_status not null default 'pending',
  currency text not null default 'USDT',
  subtotal numeric(18, 6) not null default 0,
  shipping_cost_usdt numeric(18, 6) not null default 0,
  total numeric(18, 6) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders
  add column if not exists seller_vendor_id uuid references public.vendors (id) on delete set null;

alter table public.orders
  add column if not exists buyer_region_id uuid references public.sourcing_regions (id) on delete set null;

alter table public.orders
  add column if not exists buyer_country_code text;

alter table public.orders
  add column if not exists platform_commission_usdt numeric(18, 6) not null default 0;

alter table public.orders
  add column if not exists tracking_number text;

alter table public.orders
  add column if not exists tracking_carrier text;

alter table public.orders
  add column if not exists tracking_url text;

alter table public.orders
  add column if not exists shipped_at timestamptz;

alter table public.orders
  add column if not exists delivered_at timestamptz;

alter table public.orders
  add column if not exists payout_status public.order_payout_status not null default 'not_applicable';

alter table public.orders
  add column if not exists payout_released_at timestamptz;

alter table public.orders
  add column if not exists payout_release_source text;

comment on column public.orders.platform_commission_usdt is
  'Platform cut (typically 3% of dropship GMV, capped at margin). Held in escrow until delivery.';
comment on column public.orders.payout_status is
  'held = credits in escrow_balance; released = moved to available_balance after delivery.';
comment on column public.orders.tracking_number is
  'Carrier tracking number used for delivery confirmation / fulfillment sync.';

create index if not exists orders_customer_id_idx on public.orders (customer_id);
create index if not exists orders_vendor_id_idx on public.orders (vendor_id);
create index if not exists orders_seller_vendor_id_idx on public.orders (seller_vendor_id);
create index if not exists orders_payout_status_idx on public.orders (payout_status);
create index if not exists orders_status_idx on public.orders (status);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  product_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(18, 6) not null check (unit_price >= 0),
  line_total numeric(18, 6) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);

create index if not exists order_items_order_id_idx on public.order_items (order_id);

-- ---------------------------------------------------------------------------
-- 10) order_escrow_ledger (= escrow_transactions)
-- ---------------------------------------------------------------------------

create table if not exists public.order_escrow_ledger (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  beneficiary_user_id uuid not null references public.profiles (id) on delete restrict,
  role public.order_escrow_role not null,
  amount_usdt numeric(18, 6) not null check (amount_usdt > 0),
  status text not null default 'held'
    check (status in ('held', 'released')),
  hold_tx_id uuid references public.wallet_transactions (id) on delete set null,
  release_tx_id uuid references public.wallet_transactions (id) on delete set null,
  created_at timestamptz not null default now(),
  released_at timestamptz,
  unique (order_id, role, beneficiary_user_id)
);

create index if not exists order_escrow_ledger_order_id_idx
  on public.order_escrow_ledger (order_id);
create index if not exists order_escrow_ledger_status_idx
  on public.order_escrow_ledger (status);

-- Compatibility alias requested as "escrow_transactions"
create or replace view public.escrow_transactions
with (security_invoker = true)
as
select
  id,
  order_id,
  beneficiary_user_id,
  role,
  amount_usdt,
  status as hold_status,
  hold_tx_id,
  release_tx_id,
  created_at,
  released_at
from public.order_escrow_ledger;

comment on view public.escrow_transactions is
  'Alias of order_escrow_ledger for escrow hold/release rows (supplier, seller, platform).';

-- Platform commission default (3%)
create table if not exists public.dropship_fee_settings (
  id integer primary key default 1 check (id = 1),
  commission_rate numeric(6, 4) not null default 0.03
    check (commission_rate >= 0 and commission_rate <= 1),
  updated_at timestamptz not null default now()
);

insert into public.dropship_fee_settings (id, commission_rate)
values (1, 0.03)
on conflict (id) do nothing;

comment on column public.dropship_fee_settings.commission_rate is
  'Platform dropship commission rate (0.03 = 3%). Applied at checkout into escrow.';

-- ---------------------------------------------------------------------------
-- 11) Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.vendors enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.wallets enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.order_escrow_ledger enable row level security;
alter table public.sourcing_regions enable row level security;
alter table public.supplier_providers enable row level security;
alter table public.product_supplier_routes enable row level security;
alter table public.dropship_fee_settings enable row level security;

-- profiles: read own or admin; update own (non-role) or admin
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
  on public.profiles for select
  using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin"
  on public.profiles for update
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- vendors: public can read approved; owners/admins manage
drop policy if exists "vendors_select_approved_own_or_admin" on public.vendors;
create policy "vendors_select_approved_own_or_admin"
  on public.vendors for select
  using (
    status = 'approved'
    or owner_id = auth.uid()
    or public.is_admin()
  );

drop policy if exists "vendors_update_own_or_admin" on public.vendors;
create policy "vendors_update_own_or_admin"
  on public.vendors for update
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());

-- products: public active; owners CRUD; admin all
drop policy if exists "products_select_active_own_or_admin" on public.products;
create policy "products_select_active_own_or_admin"
  on public.products for select
  using (
    status = 'active'
    or public.owns_vendor(vendor_id)
    or public.is_admin()
  );

drop policy if exists "products_insert_own_vendor" on public.products;
create policy "products_insert_own_vendor"
  on public.products for insert
  with check (public.owns_vendor(vendor_id) or public.is_admin());

drop policy if exists "products_update_own_vendor" on public.products;
create policy "products_update_own_vendor"
  on public.products for update
  using (public.owns_vendor(vendor_id) or public.is_admin())
  with check (public.owns_vendor(vendor_id) or public.is_admin());

drop policy if exists "products_delete_own_vendor" on public.products;
create policy "products_delete_own_vendor"
  on public.products for delete
  using (public.owns_vendor(vendor_id) or public.is_admin());

-- orders / items: SELECT own (buyer, fulfilling vendor, seller vendor, admin).
-- Mutations go through SECURITY DEFINER RPCs (checkout, fulfill, confirm delivery).
drop policy if exists "orders_select_participant_or_admin" on public.orders;
create policy "orders_select_participant_or_admin"
  on public.orders for select
  using (
    customer_id = auth.uid()
    or public.owns_vendor(vendor_id)
    or (seller_vendor_id is not null and public.owns_vendor(seller_vendor_id))
    or public.is_admin()
  );

drop policy if exists "order_items_select_via_order" on public.order_items;
create policy "order_items_select_via_order"
  on public.order_items for select
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (
          o.customer_id = auth.uid()
          or public.owns_vendor(o.vendor_id)
          or (o.seller_vendor_id is not null and public.owns_vendor(o.seller_vendor_id))
          or public.is_admin()
        )
    )
  );

-- wallets: SELECT own or admin; no direct client writes
drop policy if exists "wallets_select_own_or_admin" on public.wallets;
create policy "wallets_select_own_or_admin"
  on public.wallets for select
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "wallet_transactions_select_own_or_admin" on public.wallet_transactions;
create policy "wallet_transactions_select_own_or_admin"
  on public.wallet_transactions for select
  using (
    exists (
      select 1 from public.wallets w
      where w.id = wallet_id
        and (w.user_id = auth.uid() or public.is_admin())
    )
  );

-- escrow ledger: beneficiary, order participants, admin
drop policy if exists "order_escrow_ledger_select_own_or_admin" on public.order_escrow_ledger;
create policy "order_escrow_ledger_select_own_or_admin"
  on public.order_escrow_ledger for select
  using (
    beneficiary_user_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.orders o
      where o.id = order_id
        and (
          o.customer_id = auth.uid()
          or public.owns_vendor(o.vendor_id)
          or (o.seller_vendor_id is not null and public.owns_vendor(o.seller_vendor_id))
        )
    )
  );

-- sourcing regions + supplier providers: public read of active rows
drop policy if exists "sourcing_regions_select_active_or_admin" on public.sourcing_regions;
create policy "sourcing_regions_select_active_or_admin"
  on public.sourcing_regions for select
  using (is_active or public.is_admin());

drop policy if exists "supplier_providers_select_active_or_admin" on public.supplier_providers;
create policy "supplier_providers_select_active_or_admin"
  on public.supplier_providers for select
  using (is_active or public.is_admin());

drop policy if exists "product_supplier_routes_select_related" on public.product_supplier_routes;
create policy "product_supplier_routes_select_related"
  on public.product_supplier_routes for select
  using (
    is_active
    or public.is_admin()
    or exists (
      select 1 from public.products p
      where p.id = product_id and public.owns_vendor(p.vendor_id)
    )
  );

drop policy if exists "product_supplier_routes_write_own_vendor" on public.product_supplier_routes;
create policy "product_supplier_routes_write_own_vendor"
  on public.product_supplier_routes for all
  using (
    public.is_admin()
    or exists (
      select 1 from public.products p
      where p.id = product_id and public.owns_vendor(p.vendor_id)
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1 from public.products p
      where p.id = product_id and public.owns_vendor(p.vendor_id)
    )
  );

drop policy if exists "dropship_fee_settings_select_authenticated" on public.dropship_fee_settings;
create policy "dropship_fee_settings_select_authenticated"
  on public.dropship_fee_settings for select
  using (auth.uid() is not null);

drop policy if exists "dropship_fee_settings_admin_write" on public.dropship_fee_settings;
create policy "dropship_fee_settings_admin_write"
  on public.dropship_fee_settings for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 12) Guards: KYC required to publish; escrow note
-- ---------------------------------------------------------------------------

create or replace function public.vendor_kyc_is_approved(p_vendor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.vendors v
    where v.id = p_vendor_id and v.kyc_status = 'approved'
  );
$$;

create or replace function public.products_require_vendor_kyc_active()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'active'
     and (tg_op = 'INSERT' or old.status is distinct from 'active')
     and not public.vendor_kyc_is_approved(new.vendor_id) then
    raise exception 'KYC approval required before publishing products';
  end if;
  return new;
end;
$$;

drop trigger if exists products_require_vendor_kyc_active on public.products;
create trigger products_require_vendor_kyc_active
  before insert or update of status on public.products
  for each row
  execute function public.products_require_vendor_kyc_active();

-- ---------------------------------------------------------------------------
-- Done
-- Business RPCs (checkout_with_usdt, hold_sale_in_escrow, release_order_escrow,
-- submit_vendor_kyc, review_vendor_kyc, product_is_deliverable_to_country, etc.)
-- remain in migrations 013–025. This file ensures the supporting schema + RLS.
-- =============================================================================
