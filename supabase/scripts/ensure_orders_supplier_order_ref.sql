-- =============================================================================
-- ensure_orders_supplier_order_ref.sql (paste-ready)
--
-- Fix: ensure_separate_cj_manual_orders_disputes.sql failed with:
--   column "supplier_order_ref" does not exist
--
-- Live DBs that skipped migration 017 never got orders.supplier_order_ref
-- (and related tracking / sync columns). Add them before any CJ registry
-- backfill or trigger that reads o.supplier_order_ref.
-- =============================================================================

-- Enums from 017 (idempotent)
do $$
begin
  create type public.fulfillment_sync_source as enum (
    'manual',
    'supplier_webhook',
    'supplier_poll',
    'system'
  );
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.fulfillment_sync_status as enum (
    'idle',
    'pending',
    'synced',
    'error'
  );
exception
  when duplicate_object then null;
end;
$$;

-- Rename common legacy aliases → canonical supplier_order_ref when present.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'orders'
      and column_name = 'supplier_order_ref'
  ) then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'orders'
        and column_name = 'supplier_ref'
    ) then
      alter table public.orders rename column supplier_ref to supplier_order_ref;
    elsif exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'orders'
        and column_name = 'external_order_ref'
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

comment on column public.orders.supplier_order_ref is
  'External supplier fulfillment id used by auto-sync workers.';
comment on column public.orders.tracking_number is
  'Parcel tracking number shown to buyers.';
comment on column public.orders.tracking_carrier is
  'Carrier label (DHL, Myanmar Post, CJ Express, etc.).';
comment on column public.orders.tracking_url is
  'Optional carrier tracking URL.';
comment on column public.orders.fulfillment_sync_status is
  'Last supplier auto-fulfillment sync outcome.';

create index if not exists orders_tracking_number_idx
  on public.orders (tracking_number)
  where tracking_number is not null;

create index if not exists orders_supplier_order_ref_idx
  on public.orders (supplier_order_ref)
  where supplier_order_ref is not null;

create index if not exists orders_fulfillment_sync_status_idx
  on public.orders (fulfillment_sync_status, updated_at desc);

-- If cj_order_fulfillments already exists from a partial 061 run, ensure ref col.
do $$
begin
  if to_regclass('public.cj_order_fulfillments') is not null then
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

    update public.cj_order_fulfillments c
    set supplier_order_ref = coalesce(c.supplier_order_ref, o.supplier_order_ref)
    from public.orders o
    where o.id = c.order_id
      and c.supplier_order_ref is null
      and o.supplier_order_ref is not null;
  end if;
end;
$$;
