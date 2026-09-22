-- =============================================================================
-- 062_ensure_orders_seller_vendor_id.sql
--
-- Fix: ensure scripts / migration 061 failed with:
--   column "seller_vendor_id" does not exist
--
-- Live DBs that skipped dropship migrations never got orders.seller_vendor_id.
-- Add it (and related FKs/indexes) before any CJ/manual channel SQL runs.
-- =============================================================================

-- Core vendor linkage on orders
alter table public.orders
  add column if not exists vendor_id uuid references public.vendors (id) on delete restrict;

alter table public.orders
  add column if not exists seller_vendor_id uuid references public.vendors (id) on delete set null;

-- Backfill storefront seller from fulfillment vendor (direct / local sales).
update public.orders
set seller_vendor_id = vendor_id
where seller_vendor_id is null
  and vendor_id is not null;

do $$
begin
  -- Prefer NOT NULL when every row has a seller; otherwise keep nullable.
  if not exists (
    select 1 from public.orders where seller_vendor_id is null
  ) then
    begin
      alter table public.orders
        alter column seller_vendor_id set not null;
    exception
      when others then null;
    end;
  end if;
end;
$$;

create index if not exists orders_vendor_id_idx
  on public.orders (vendor_id);

create index if not exists orders_seller_vendor_id_idx
  on public.orders (seller_vendor_id);

comment on column public.orders.vendor_id is
  'Fulfillment / supplier vendor for this order (FK → vendors).';
comment on column public.orders.seller_vendor_id is
  'Storefront seller (dropshipper or direct seller). Equals vendor_id for local sales.';

-- If cj_order_fulfillments already exists from a partial 061 run, ensure columns.
do $$
begin
  if to_regclass('public.cj_order_fulfillments') is not null then
    alter table public.cj_order_fulfillments
      add column if not exists vendor_id uuid references public.vendors (id) on delete set null;
    alter table public.cj_order_fulfillments
      add column if not exists seller_vendor_id uuid references public.vendors (id) on delete set null;

    -- Mirror seller from orders when the registry row is blank.
    update public.cj_order_fulfillments c
    set
      vendor_id = coalesce(c.vendor_id, o.vendor_id),
      seller_vendor_id = coalesce(c.seller_vendor_id, o.seller_vendor_id, o.vendor_id)
    from public.orders o
    where o.id = c.order_id
      and (
        c.seller_vendor_id is null
        or c.vendor_id is null
      );

    create index if not exists cj_order_fulfillments_seller_idx
      on public.cj_order_fulfillments (seller_vendor_id, created_at desc);
  end if;
end;
$$;

-- Safe composite index used by 061 (now that seller_vendor_id exists).
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'orders'
      and column_name = 'fulfillment_channel'
  ) then
    execute $idx$
      create index if not exists orders_seller_fulfillment_channel_idx
        on public.orders (seller_vendor_id, fulfillment_channel, created_at desc)
    $idx$;
    execute $idx$
      create index if not exists orders_vendor_fulfillment_channel_idx
        on public.orders (vendor_id, fulfillment_channel, created_at desc)
    $idx$;
  end if;
end;
$$;

notify pgrst, 'reload schema';
