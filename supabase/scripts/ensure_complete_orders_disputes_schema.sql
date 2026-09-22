-- =============================================================================
-- ensure_complete_orders_disputes_schema.sql (paste-ready, ONE SHOT)
--
-- Run once in Supabase → SQL Editor to heal drifted DBs that failed mid-way
-- through the CJ/manual orders + disputes setup with missing tables/columns:
--   disputes, cj_order_fulfillments, cj_imported_products, supplier_providers
--   orders.customer_id | seller_vendor_id | supplier_order_ref | updated_at |
--   fulfillment_channel | tracking_* | fulfillment_sync_*
--
-- Idempotent: safe to re-run. Assumes public.orders, public.vendors,
-- public.profiles, public.products, public.order_items already exist.
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 0) Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  );
$$;

create or replace function public.owns_vendor(p_vendor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_vendor_id is not null
    and auth.uid() is not null
    and exists (
      select 1
      from public.vendors v
      where v.id = p_vendor_id
        and v.owner_id = auth.uid()
    );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;
revoke all on function public.owns_vendor(uuid) from public;
grant execute on function public.owns_vendor(uuid) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1) supplier_providers (FK target for CJ registry / imports)
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

alter type public.supplier_provider_kind add value if not exists 'internal';
alter type public.supplier_provider_kind add value if not exists 'cj_dropshipping';
alter type public.supplier_provider_kind add value if not exists 'dsers';
alter type public.supplier_provider_kind add value if not exists 'spocket';
alter type public.supplier_provider_kind add value if not exists 'print_on_demand';
alter type public.supplier_provider_kind add value if not exists 'warehouse';
alter type public.supplier_provider_kind add value if not exists 'other';

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

insert into public.supplier_providers (
  slug, name, kind, default_origin_country, supports_regions, notes, is_active
)
values
  (
    'cj-dropshipping',
    'CJ Dropshipping',
    'cj_dropshipping',
    'CN',
    array['GLOBAL', 'US', 'EU', 'SEA', 'MM'],
    'Primary CJ Dropshipping integration.',
    true
  )
on conflict (slug) do update
  set
    name = excluded.name,
    kind = excluded.kind,
    is_active = true,
    updated_at = now();

-- ---------------------------------------------------------------------------
-- 2) Product catalog split (classifier input for order_is_cj_fulfillment)
-- ---------------------------------------------------------------------------

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

alter table public.products
  add column if not exists created_at timestamptz not null default now();

alter table public.products
  add column if not exists updated_at timestamptz not null default now();

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

create index if not exists products_vendor_catalog_kind_idx
  on public.products (vendor_id, catalog_kind, created_at desc);

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

alter table public.cj_imported_products
  add column if not exists created_at timestamptz not null default now();
alter table public.cj_imported_products
  add column if not exists updated_at timestamptz not null default now();

create index if not exists cj_imported_products_vendor_idx
  on public.cj_imported_products (vendor_id, created_at desc);
create index if not exists cj_imported_products_external_idx
  on public.cj_imported_products (external_product_id);

drop trigger if exists cj_imported_products_set_updated_at
  on public.cj_imported_products;
create trigger cj_imported_products_set_updated_at
  before update on public.cj_imported_products
  for each row execute function public.set_updated_at();

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

grant select on public.manual_products to authenticated, anon;
grant select on public.cj_products to authenticated, anon;

-- Soft columns on order_items used by the CJ classifier
alter table public.order_items
  add column if not exists product_id uuid references public.products (id) on delete set null;
do $$
begin
  alter table public.order_items
    add column if not exists listing_product_id uuid references public.products (id) on delete set null;
exception when others then null;
end;
$$;
do $$
begin
  alter table public.order_items
    add column if not exists supplier_provider_id uuid references public.supplier_providers (id) on delete set null;
exception when others then null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) orders — all required columns (seller, buyer, tracking, timestamps, channel)
-- ---------------------------------------------------------------------------

alter table public.orders
  add column if not exists vendor_id uuid references public.vendors (id) on delete restrict;

alter table public.orders
  add column if not exists seller_vendor_id uuid references public.vendors (id) on delete set null;

update public.orders
set seller_vendor_id = vendor_id
where seller_vendor_id is null
  and vendor_id is not null;

create index if not exists orders_vendor_id_idx on public.orders (vendor_id);
create index if not exists orders_seller_vendor_id_idx on public.orders (seller_vendor_id);

-- customer_id (rename legacy user_id when needed)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'user_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'customer_id'
  ) then
    alter table public.orders rename column user_id to customer_id;
  end if;
end;
$$;

alter table public.orders
  add column if not exists customer_id uuid references public.profiles (id) on delete restrict;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'user_id'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'customer_id'
  ) then
    execute $sql$
      update public.orders
      set customer_id = user_id
      where customer_id is null and user_id is not null
    $sql$;
  end if;
end;
$$;

create index if not exists orders_customer_id_idx on public.orders (customer_id);

-- tracking / supplier ref / sync enums + columns
do $$
begin
  create type public.fulfillment_sync_source as enum (
    'manual', 'supplier_webhook', 'supplier_poll', 'system'
  );
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.fulfillment_sync_status as enum (
    'idle', 'pending', 'synced', 'error'
  );
exception when duplicate_object then null;
end;
$$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'supplier_order_ref'
  ) then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'orders' and column_name = 'supplier_ref'
    ) then
      alter table public.orders rename column supplier_ref to supplier_order_ref;
    elsif exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'orders' and column_name = 'external_order_ref'
    ) then
      alter table public.orders rename column external_order_ref to supplier_order_ref;
    end if;
  end if;
end;
$$;

alter table public.orders
  add column if not exists tracking_number text,
  add column if not exists tracking_carrier text,
  add column if not exists tracking_url text,
  add column if not exists shipped_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists supplier_order_ref text,
  add column if not exists fulfillment_sync_status public.fulfillment_sync_status
    not null default 'idle',
  add column if not exists fulfillment_synced_at timestamptz,
  add column if not exists fulfillment_sync_error text;

create index if not exists orders_tracking_number_idx
  on public.orders (tracking_number)
  where tracking_number is not null;
create index if not exists orders_supplier_order_ref_idx
  on public.orders (supplier_order_ref)
  where supplier_order_ref is not null;

-- timestamps
alter table public.orders
  add column if not exists created_at timestamptz not null default now();
alter table public.orders
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

create index if not exists orders_fulfillment_sync_status_idx
  on public.orders (fulfillment_sync_status, updated_at desc);

-- fulfillment_channel
do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'fulfillment_channel'
  ) then
    create type public.fulfillment_channel as enum ('manual', 'cj');
  end if;
end;
$$;

alter table public.orders
  add column if not exists fulfillment_channel public.fulfillment_channel;

update public.orders
set fulfillment_channel = 'manual'::public.fulfillment_channel
where fulfillment_channel is null;

alter table public.orders
  alter column fulfillment_channel set default 'manual'::public.fulfillment_channel;

do $$
begin
  alter table public.orders
    alter column fulfillment_channel set not null;
exception when others then null;
end;
$$;

comment on column public.orders.fulfillment_channel is
  'manual = local/custom vendor fulfillment; cj = CJ Dropshipping API fulfillment.';
comment on column public.orders.customer_id is
  'Buyer profile id (auth user). Canonical customer column — not user_id.';
comment on column public.orders.seller_vendor_id is
  'Storefront seller (dropshipper or direct seller). Equals vendor_id for local sales.';
comment on column public.orders.supplier_order_ref is
  'External supplier fulfillment id used by auto-sync workers.';
comment on column public.orders.updated_at is
  'Last mutation timestamp; kept in sync by set_updated_at() and channel refresh.';

create index if not exists orders_fulfillment_channel_created_idx
  on public.orders (fulfillment_channel, created_at desc);
create index if not exists orders_seller_fulfillment_channel_idx
  on public.orders (seller_vendor_id, fulfillment_channel, created_at desc);
create index if not exists orders_vendor_fulfillment_channel_idx
  on public.orders (vendor_id, fulfillment_channel, created_at desc);

-- ---------------------------------------------------------------------------
-- 4) disputes table + channel + RLS
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.dispute_status as enum (
    'open', 'under_review', 'resolved_refund', 'resolved_release', 'cancelled'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.dispute_reason as enum (
    'not_received', 'damaged', 'not_as_described', 'wrong_item', 'other'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  alter type public.order_payout_status add value 'disputed';
exception when duplicate_object then null; when undefined_object then null;
end $$;
do $$ begin
  alter type public.order_payout_status add value 'refunded';
exception when duplicate_object then null; when undefined_object then null;
end $$;

create table if not exists public.disputes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  opened_by uuid not null references public.profiles (id) on delete restrict,
  reason public.dispute_reason not null,
  description text,
  status public.dispute_status not null default 'open',
  resolution_note text,
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  fulfillment_channel public.fulfillment_channel not null
    default 'manual'::public.fulfillment_channel,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.disputes
  add column if not exists fulfillment_channel public.fulfillment_channel;
alter table public.disputes
  add column if not exists created_at timestamptz not null default now();
alter table public.disputes
  add column if not exists updated_at timestamptz not null default now();
alter table public.disputes
  add column if not exists description text;
alter table public.disputes
  add column if not exists resolution_note text;
alter table public.disputes
  add column if not exists resolved_by uuid references public.profiles (id) on delete set null;
alter table public.disputes
  add column if not exists resolved_at timestamptz;

update public.disputes
set fulfillment_channel = 'manual'::public.fulfillment_channel
where fulfillment_channel is null;

update public.disputes d
set fulfillment_channel = coalesce(o.fulfillment_channel, 'manual'::public.fulfillment_channel)
from public.orders o
where d.order_id = o.id
  and d.fulfillment_channel is null;

alter table public.disputes
  alter column fulfillment_channel set default 'manual'::public.fulfillment_channel;

do $$
begin
  alter table public.disputes
    alter column fulfillment_channel set not null;
exception when others then null;
end;
$$;

create unique index if not exists disputes_one_open_per_order_idx
  on public.disputes (order_id)
  where status in ('open', 'under_review');
create index if not exists disputes_status_idx on public.disputes (status, created_at desc);
create index if not exists disputes_opened_by_idx on public.disputes (opened_by);
create index if not exists disputes_order_id_idx on public.disputes (order_id);
create index if not exists disputes_fulfillment_channel_created_idx
  on public.disputes (fulfillment_channel, created_at desc);
create index if not exists disputes_channel_status_idx
  on public.disputes (fulfillment_channel, status, created_at desc);

comment on table public.disputes is
  'Buyer complaints for orders. Partitioned by fulfillment_channel (manual vs cj).';

alter table public.disputes enable row level security;

drop policy if exists "disputes_select_participant_or_admin" on public.disputes;
create policy "disputes_select_participant_or_admin"
  on public.disputes for select
  using (
    opened_by = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.orders o
      where o.id = order_id
        and (
          o.customer_id = auth.uid()
          or public.owns_vendor(o.vendor_id)
          or (
            o.seller_vendor_id is not null
            and public.owns_vendor(o.seller_vendor_id)
          )
        )
    )
  );

drop trigger if exists disputes_set_updated_at on public.disputes;
create trigger disputes_set_updated_at
  before update on public.disputes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5) cj_order_fulfillments registry
-- ---------------------------------------------------------------------------

create table if not exists public.cj_order_fulfillments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id) on delete cascade,
  vendor_id uuid references public.vendors (id) on delete set null,
  seller_vendor_id uuid references public.vendors (id) on delete set null,
  provider_id uuid references public.supplier_providers (id) on delete set null,
  supplier_order_ref text,
  tracking_number text,
  tracking_carrier text,
  tracking_url text,
  last_sync_status text,
  last_sync_error text,
  last_synced_at timestamptz,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cj_order_fulfillments
  add column if not exists vendor_id uuid references public.vendors (id) on delete set null;
alter table public.cj_order_fulfillments
  add column if not exists seller_vendor_id uuid references public.vendors (id) on delete set null;
alter table public.cj_order_fulfillments
  add column if not exists provider_id uuid references public.supplier_providers (id) on delete set null;
alter table public.cj_order_fulfillments
  add column if not exists supplier_order_ref text;
alter table public.cj_order_fulfillments
  add column if not exists tracking_number text;
alter table public.cj_order_fulfillments
  add column if not exists tracking_carrier text;
alter table public.cj_order_fulfillments
  add column if not exists tracking_url text;
alter table public.cj_order_fulfillments
  add column if not exists last_sync_status text;
alter table public.cj_order_fulfillments
  add column if not exists last_sync_error text;
alter table public.cj_order_fulfillments
  add column if not exists last_synced_at timestamptz;
alter table public.cj_order_fulfillments
  add column if not exists source_payload jsonb not null default '{}'::jsonb;
alter table public.cj_order_fulfillments
  add column if not exists created_at timestamptz not null default now();
alter table public.cj_order_fulfillments
  add column if not exists updated_at timestamptz not null default now();

create index if not exists cj_order_fulfillments_vendor_idx
  on public.cj_order_fulfillments (vendor_id, created_at desc);
create index if not exists cj_order_fulfillments_seller_idx
  on public.cj_order_fulfillments (seller_vendor_id, created_at desc);

comment on table public.cj_order_fulfillments is
  'CJ Dropshipping fulfillment/tracking registry. Manual local orders never appear here.';

drop trigger if exists cj_order_fulfillments_set_updated_at
  on public.cj_order_fulfillments;
create trigger cj_order_fulfillments_set_updated_at
  before update on public.cj_order_fulfillments
  for each row execute function public.set_updated_at();

alter table public.cj_order_fulfillments enable row level security;

drop policy if exists "cj_order_fulfillments_participant_select"
  on public.cj_order_fulfillments;
create policy "cj_order_fulfillments_participant_select"
  on public.cj_order_fulfillments for select
  using (
    public.is_admin()
    or (vendor_id is not null and public.owns_vendor(vendor_id))
    or (seller_vendor_id is not null and public.owns_vendor(seller_vendor_id))
    or exists (
      select 1 from public.orders o
      where o.id = order_id and o.customer_id = auth.uid()
    )
  );

drop policy if exists "cj_order_fulfillments_admin_write"
  on public.cj_order_fulfillments;
create policy "cj_order_fulfillments_admin_write"
  on public.cj_order_fulfillments for all
  using (public.is_admin() or public.owns_vendor(coalesce(vendor_id, seller_vendor_id)))
  with check (public.is_admin() or public.owns_vendor(coalesce(vendor_id, seller_vendor_id)));

-- ---------------------------------------------------------------------------
-- 6) Classifier + channel refresh + triggers
-- ---------------------------------------------------------------------------

create or replace function public.order_is_cj_fulfillment(p_order_id uuid)
returns boolean
language plpgsql
stable
as $$
declare
  v_hit boolean := false;
begin
  if p_order_id is null then
    return false;
  end if;

  select fulfillment_channel = 'cj'::public.fulfillment_channel
    into v_hit
  from public.orders
  where id = p_order_id;
  if coalesce(v_hit, false) then
    return true;
  end if;

  if exists (
    select 1
    from public.order_items oi
    join public.products p on p.id = coalesce(oi.listing_product_id, oi.product_id)
    where oi.order_id = p_order_id
      and p.catalog_kind = 'cj_import'::public.product_catalog_kind
  ) then
    return true;
  end if;

  if exists (
    select 1
    from public.order_items oi
    join public.cj_imported_products c on c.product_id = coalesce(oi.listing_product_id, oi.product_id)
    where oi.order_id = p_order_id
  ) then
    return true;
  end if;

  if to_regclass('public.supplier_providers') is not null
     and exists (
       select 1
       from public.order_items oi
       join public.supplier_providers sp on sp.id = oi.supplier_provider_id
       where oi.order_id = p_order_id
         and sp.kind = 'cj_dropshipping'
     ) then
    return true;
  end if;

  if to_regclass('public.supplier_fulfillment_jobs') is not null
     and exists (
       select 1
       from public.supplier_fulfillment_jobs j
       where j.order_id = p_order_id
         and (
           j.provider_kind = 'cj_dropshipping'
           or exists (
             select 1 from public.supplier_providers sp
             where sp.id = j.provider_id and sp.kind = 'cj_dropshipping'
           )
         )
     ) then
    return true;
  end if;

  return false;
exception
  when others then
    return false;
end;
$$;

create or replace function public.refresh_order_fulfillment_channel(p_order_id uuid)
returns public.fulfillment_channel
language plpgsql
as $$
declare
  v_channel public.fulfillment_channel;
begin
  v_channel := case
    when public.order_is_cj_fulfillment(p_order_id) then 'cj'::public.fulfillment_channel
    else 'manual'::public.fulfillment_channel
  end;

  update public.orders
  set
    fulfillment_channel = v_channel,
    updated_at = now()
  where id = p_order_id
    and fulfillment_channel is distinct from v_channel;

  if v_channel = 'cj'::public.fulfillment_channel then
    insert into public.cj_order_fulfillments (
      order_id,
      vendor_id,
      seller_vendor_id,
      supplier_order_ref,
      tracking_number,
      tracking_carrier,
      tracking_url,
      last_sync_status,
      last_sync_error,
      last_synced_at
    )
    select
      o.id,
      o.vendor_id,
      coalesce(o.seller_vendor_id, o.vendor_id),
      o.supplier_order_ref,
      o.tracking_number,
      o.tracking_carrier,
      o.tracking_url,
      o.fulfillment_sync_status::text,
      o.fulfillment_sync_error,
      o.fulfillment_synced_at
    from public.orders o
    where o.id = p_order_id
    on conflict (order_id) do update
      set
        vendor_id = excluded.vendor_id,
        seller_vendor_id = coalesce(excluded.seller_vendor_id, cj_order_fulfillments.seller_vendor_id),
        supplier_order_ref = coalesce(excluded.supplier_order_ref, cj_order_fulfillments.supplier_order_ref),
        tracking_number = coalesce(excluded.tracking_number, cj_order_fulfillments.tracking_number),
        tracking_carrier = coalesce(excluded.tracking_carrier, cj_order_fulfillments.tracking_carrier),
        tracking_url = coalesce(excluded.tracking_url, cj_order_fulfillments.tracking_url),
        last_sync_status = coalesce(excluded.last_sync_status, cj_order_fulfillments.last_sync_status),
        last_sync_error = excluded.last_sync_error,
        last_synced_at = coalesce(excluded.last_synced_at, cj_order_fulfillments.last_synced_at),
        updated_at = now();
  end if;

  update public.disputes
  set fulfillment_channel = v_channel
  where order_id = p_order_id
    and fulfillment_channel is distinct from v_channel;

  return v_channel;
end;
$$;

create or replace function public.trg_refresh_order_fulfillment_channel()
returns trigger
language plpgsql
as $$
declare
  v_order_id uuid;
begin
  v_order_id := coalesce(new.order_id, old.order_id);
  if v_order_id is not null then
    perform public.refresh_order_fulfillment_channel(v_order_id);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists order_items_refresh_fulfillment_channel on public.order_items;
create trigger order_items_refresh_fulfillment_channel
  after insert or update or delete on public.order_items
  for each row execute function public.trg_refresh_order_fulfillment_channel();

do $$
begin
  if to_regclass('public.supplier_fulfillment_jobs') is not null then
    execute $trig$
      drop trigger if exists supplier_jobs_refresh_fulfillment_channel
        on public.supplier_fulfillment_jobs
    $trig$;
    execute $trig$
      create trigger supplier_jobs_refresh_fulfillment_channel
        after insert or update of provider_id, provider_kind, order_id
        on public.supplier_fulfillment_jobs
        for each row execute function public.trg_refresh_order_fulfillment_channel()
    $trig$;
  end if;
exception when others then null;
end;
$$;

create or replace function public.trg_disputes_set_fulfillment_channel()
returns trigger
language plpgsql
as $$
declare
  v_channel public.fulfillment_channel;
begin
  select coalesce(fulfillment_channel, 'manual'::public.fulfillment_channel)
    into v_channel
  from public.orders
  where id = new.order_id;

  new.fulfillment_channel := coalesce(v_channel, 'manual'::public.fulfillment_channel);
  return new;
end;
$$;

drop trigger if exists disputes_set_fulfillment_channel on public.disputes;
create trigger disputes_set_fulfillment_channel
  before insert or update of order_id on public.disputes
  for each row execute function public.trg_disputes_set_fulfillment_channel();

create or replace function public.trg_orders_sync_cj_fulfillment_registry()
returns trigger
language plpgsql
as $$
begin
  if new.fulfillment_channel = 'cj'::public.fulfillment_channel then
    insert into public.cj_order_fulfillments (
      order_id, vendor_id, seller_vendor_id, supplier_order_ref,
      tracking_number, tracking_carrier, tracking_url,
      last_sync_status, last_sync_error, last_synced_at
    ) values (
      new.id, new.vendor_id, coalesce(new.seller_vendor_id, new.vendor_id), new.supplier_order_ref,
      new.tracking_number, new.tracking_carrier, new.tracking_url,
      new.fulfillment_sync_status::text, new.fulfillment_sync_error, new.fulfillment_synced_at
    )
    on conflict (order_id) do update set
      vendor_id = excluded.vendor_id,
      seller_vendor_id = excluded.seller_vendor_id,
      supplier_order_ref = excluded.supplier_order_ref,
      tracking_number = excluded.tracking_number,
      tracking_carrier = excluded.tracking_carrier,
      tracking_url = excluded.tracking_url,
      last_sync_status = excluded.last_sync_status,
      last_sync_error = excluded.last_sync_error,
      last_synced_at = excluded.last_synced_at,
      updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists orders_sync_cj_fulfillment_registry on public.orders;
create trigger orders_sync_cj_fulfillment_registry
  after insert or update of fulfillment_channel, supplier_order_ref,
    tracking_number, tracking_carrier, tracking_url,
    fulfillment_sync_status, fulfillment_sync_error, fulfillment_synced_at
  on public.orders
  for each row execute function public.trg_orders_sync_cj_fulfillment_registry();

-- ---------------------------------------------------------------------------
-- 7) Backfill channels + convenience views
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
begin
  for r in
    select id from public.orders
    order by created_at desc
    limit 5000
  loop
    perform public.refresh_order_fulfillment_channel(r.id);
  end loop;
exception
  when others then
    raise notice 'order channel backfill partial: %', sqlerrm;
end;
$$;

create or replace view public.manual_orders as
select * from public.orders
where fulfillment_channel = 'manual'::public.fulfillment_channel;

create or replace view public.cj_orders as
select
  o.*,
  c.id as cj_fulfillment_id,
  c.supplier_order_ref as cj_supplier_order_ref,
  c.tracking_number as cj_tracking_number,
  c.last_synced_at as cj_last_synced_at
from public.orders o
left join public.cj_order_fulfillments c on c.order_id = o.id
where o.fulfillment_channel = 'cj'::public.fulfillment_channel;

create or replace view public.manual_disputes as
select * from public.disputes
where fulfillment_channel = 'manual'::public.fulfillment_channel;

create or replace view public.cj_disputes as
select * from public.disputes
where fulfillment_channel = 'cj'::public.fulfillment_channel;

comment on view public.manual_orders is
  'Local / custom-sourced orders (vendor ships manually).';
comment on view public.cj_orders is
  'CJ Dropshipping API fulfillment orders.';
comment on view public.manual_disputes is
  'Complaints for manual/custom orders.';
comment on view public.cj_disputes is
  'Complaints for CJ Dropshipping orders.';

grant select on public.manual_orders to authenticated, anon;
grant select on public.cj_orders to authenticated, anon;
grant select on public.disputes to authenticated, anon;
grant select on public.manual_disputes to authenticated, anon;
grant select on public.cj_disputes to authenticated, anon;
grant select on public.cj_order_fulfillments to authenticated, anon;

notify pgrst, 'reload schema';
