-- =============================================================================
-- 061_separate_cj_manual_orders_disputes.sql
--
-- Completely separate CJ Dropshipping vs manual custom sourcing workflows for:
--   - orders / tracking
--   - disputes / complaints
-- (Products already use catalog_kind + cj_imported_products in 060.)
-- =============================================================================

-- Prerequisite: seller_vendor_id (missing on some drifted live DBs).
alter table public.orders
  add column if not exists vendor_id uuid references public.vendors (id) on delete restrict;

alter table public.orders
  add column if not exists seller_vendor_id uuid references public.vendors (id) on delete set null;

update public.orders
set seller_vendor_id = vendor_id
where seller_vendor_id is null
  and vendor_id is not null;

create index if not exists orders_seller_vendor_id_idx
  on public.orders (seller_vendor_id);

-- Prerequisite buyer column: canonical is customer_id (not user_id).
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

-- Prerequisite tracking / supplier ref columns (from 017; missing on drifted DBs).
do $$
begin
  create type public.fulfillment_sync_status as enum (
    'idle', 'pending', 'synced', 'error'
  );
exception
  when duplicate_object then null;
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
  add column if not exists supplier_order_ref text,
  add column if not exists fulfillment_sync_status public.fulfillment_sync_status
    not null default 'idle',
  add column if not exists fulfillment_synced_at timestamptz,
  add column if not exists fulfillment_sync_error text;

create index if not exists orders_supplier_order_ref_idx
  on public.orders (supplier_order_ref)
  where supplier_order_ref is not null;

-- Prerequisite timestamps (channel refresh / CJ upserts set updated_at).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

alter table public.orders
  add column if not exists created_at timestamptz not null default now();

alter table public.orders
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'fulfillment_channel'
  ) then
    create type public.fulfillment_channel as enum ('manual', 'cj');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Orders: denormalized channel for clean UI / API filters
-- ---------------------------------------------------------------------------

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
exception
  when others then null;
end;
$$;

comment on column public.orders.fulfillment_channel is
  'manual = local/custom vendor fulfillment; cj = CJ Dropshipping API fulfillment.';

create index if not exists orders_fulfillment_channel_created_idx
  on public.orders (fulfillment_channel, created_at desc);

do $$
begin
  -- Only create composite indexes once seller_vendor_id / vendor_id exist.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders'
      and column_name = 'seller_vendor_id'
  ) then
    execute $idx$
      create index if not exists orders_seller_fulfillment_channel_idx
        on public.orders (seller_vendor_id, fulfillment_channel, created_at desc)
    $idx$;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders'
      and column_name = 'vendor_id'
  ) then
    execute $idx$
      create index if not exists orders_vendor_fulfillment_channel_idx
        on public.orders (vendor_id, fulfillment_channel, created_at desc)
    $idx$;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Disputes: ensure base table exists, then add channel partition
-- ---------------------------------------------------------------------------

-- Enums + table (idempotent) — required before ALTER / VIEW / GRANT.
do $$ begin
  create type public.dispute_status as enum (
    'open',
    'under_review',
    'resolved_refund',
    'resolved_release',
    'cancelled'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.dispute_reason as enum (
    'not_received',
    'damaged',
    'not_as_described',
    'wrong_item',
    'other'
  );
exception when duplicate_object then null;
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists disputes_one_open_per_order_idx
  on public.disputes (order_id)
  where status in ('open', 'under_review');

create index if not exists disputes_status_idx on public.disputes (status, created_at desc);
create index if not exists disputes_opened_by_idx on public.disputes (opened_by);
create index if not exists disputes_order_id_idx on public.disputes (order_id);

alter table public.disputes enable row level security;

alter table public.disputes
  add column if not exists fulfillment_channel public.fulfillment_channel;

update public.disputes d
set fulfillment_channel = coalesce(o.fulfillment_channel, 'manual'::public.fulfillment_channel)
from public.orders o
where d.order_id = o.id
  and d.fulfillment_channel is null;

update public.disputes
set fulfillment_channel = 'manual'::public.fulfillment_channel
where fulfillment_channel is null;

alter table public.disputes
  alter column fulfillment_channel set default 'manual'::public.fulfillment_channel;

do $$
begin
  alter table public.disputes
    alter column fulfillment_channel set not null;
exception
  when others then null;
end;
$$;

comment on column public.disputes.fulfillment_channel is
  'Mirrors the related order: manual custom vs CJ Dropshipping complaints.';

create index if not exists disputes_fulfillment_channel_created_idx
  on public.disputes (fulfillment_channel, created_at desc);

create index if not exists disputes_channel_status_idx
  on public.disputes (fulfillment_channel, status, created_at desc);

-- ---------------------------------------------------------------------------
-- Dedicated CJ order fulfillment registry
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

create index if not exists cj_order_fulfillments_vendor_idx
  on public.cj_order_fulfillments (vendor_id, created_at desc);

create index if not exists cj_order_fulfillments_seller_idx
  on public.cj_order_fulfillments (seller_vendor_id, created_at desc);

comment on table public.cj_order_fulfillments is
  'CJ Dropshipping fulfillment/tracking registry. Manual local orders never appear here.';

drop trigger if exists cj_order_fulfillments_set_updated_at
  on public.cj_order_fulfillments;

do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'set_updated_at'
  ) then
    create trigger cj_order_fulfillments_set_updated_at
      before update on public.cj_order_fulfillments
      for each row execute function public.set_updated_at();
  end if;
end;
$$;

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
-- Classifier helpers
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

  -- Explicit channel already set
  select fulfillment_channel = 'cj'::public.fulfillment_channel
    into v_hit
  from public.orders
  where id = p_order_id;
  if coalesce(v_hit, false) then
    return true;
  end if;

  -- CJ catalog product on any line
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

  -- Supplier provider kind on line
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

  -- Fulfillment job
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

  if to_regclass('public.disputes') is not null then
    update public.disputes
    set fulfillment_channel = v_channel
    where order_id = p_order_id
      and fulfillment_channel is distinct from v_channel;
  end if;

  return v_channel;
end;
$$;

-- Keep channel in sync when line items / jobs change
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
end;
$$;

-- Copy channel onto new disputes
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

-- Sync CJ registry when tracking fields change on CJ orders
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
-- Backfill existing orders
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

-- ---------------------------------------------------------------------------
-- Convenience views
-- ---------------------------------------------------------------------------

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

-- Dispute views + grants only after public.disputes exists (created above).
do $$
begin
  if to_regclass('public.disputes') is null then
    raise exception 'public.disputes must exist before creating dispute views';
  end if;
end;
$$;

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

notify pgrst, 'reload schema';
