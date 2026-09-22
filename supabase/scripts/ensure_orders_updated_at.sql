-- =============================================================================
-- ensure_orders_updated_at.sql (paste-ready)
--
-- Fix: ensure_separate_cj_manual_orders_disputes.sql failed with:
--   column "updated_at" does not exist
--
-- refresh_order_fulfillment_channel and CJ registry upserts set
-- orders.updated_at / cj_order_fulfillments.updated_at. Drifted DBs that
-- skipped the initial schema never got these columns.
-- =============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- orders (primary failure target)
alter table public.orders
  add column if not exists created_at timestamptz not null default now();

alter table public.orders
  add column if not exists updated_at timestamptz not null default now();

comment on column public.orders.updated_at is
  'Last mutation timestamp; kept in sync by set_updated_at() and channel refresh.';

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- cj_order_fulfillments (CREATE TABLE IF NOT EXISTS does not add missing cols)
do $$
begin
  if to_regclass('public.cj_order_fulfillments') is not null then
    alter table public.cj_order_fulfillments
      add column if not exists created_at timestamptz not null default now();
    alter table public.cj_order_fulfillments
      add column if not exists updated_at timestamptz not null default now();

    drop trigger if exists cj_order_fulfillments_set_updated_at
      on public.cj_order_fulfillments;
    create trigger cj_order_fulfillments_set_updated_at
      before update on public.cj_order_fulfillments
      for each row execute function public.set_updated_at();
  end if;
end;
$$;

-- disputes (same pattern when table exists from a partial ensure)
do $$
begin
  if to_regclass('public.disputes') is not null then
    alter table public.disputes
      add column if not exists created_at timestamptz not null default now();
    alter table public.disputes
      add column if not exists updated_at timestamptz not null default now();

    drop trigger if exists disputes_set_updated_at on public.disputes;
    create trigger disputes_set_updated_at
      before update on public.disputes
      for each row execute function public.set_updated_at();
  end if;
end;
$$;

-- Index used by supplier sync status queries (needs orders.updated_at).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'orders'
      and column_name = 'fulfillment_sync_status'
  ) then
    create index if not exists orders_fulfillment_sync_status_idx
      on public.orders (fulfillment_sync_status, updated_at desc);
  end if;
end;
$$;
