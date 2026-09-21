-- =============================================================================
-- 063_ensure_disputes_table.sql
--
-- Fix: ensure_separate_cj_manual_orders_disputes.sql failed with:
--   relation "public.disputes" does not exist
--
-- Create dispute enums + public.disputes (and channel column) before any
-- ALTER / VIEW / GRANT that depends on them. Views manual_disputes / cj_disputes
-- are created only after the base table exists.
-- =============================================================================

-- Prerequisite seller linkage (safe if already applied by 062).
alter table public.orders
  add column if not exists vendor_id uuid references public.vendors (id) on delete restrict;

alter table public.orders
  add column if not exists seller_vendor_id uuid references public.vendors (id) on delete set null;

update public.orders
set seller_vendor_id = vendor_id
where seller_vendor_id is null
  and vendor_id is not null;

-- Enums (idempotent)
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

do $$ begin
  if not exists (
    select 1 from pg_type where typname = 'fulfillment_channel'
  ) then
    create type public.fulfillment_channel as enum ('manual', 'cj');
  end if;
end;
$$;

-- Payout status values used when disputes pause escrow (best-effort).
do $$ begin
  alter type public.order_payout_status add value 'disputed';
exception when duplicate_object then null;
when undefined_object then null;
end $$;

do $$ begin
  alter type public.order_payout_status add value 'refunded';
exception when duplicate_object then null;
when undefined_object then null;
end $$;

-- Base disputes table (required before channel views / grants)
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

-- If table already existed without fulfillment_channel, add it.
alter table public.disputes
  add column if not exists fulfillment_channel public.fulfillment_channel;

update public.disputes
set fulfillment_channel = 'manual'::public.fulfillment_channel
where fulfillment_channel is null;

-- Prefer channel from the related order when present.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'orders'
      and column_name = 'fulfillment_channel'
  ) then
    update public.disputes d
    set fulfillment_channel = o.fulfillment_channel
    from public.orders o
    where d.order_id = o.id
      and o.fulfillment_channel is not null
      and d.fulfillment_channel is distinct from o.fulfillment_channel;
  end if;
end;
$$;

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

create unique index if not exists disputes_one_open_per_order_idx
  on public.disputes (order_id)
  where status in ('open', 'under_review');

create index if not exists disputes_status_idx
  on public.disputes (status, created_at desc);

create index if not exists disputes_opened_by_idx
  on public.disputes (opened_by);

create index if not exists disputes_order_id_idx
  on public.disputes (order_id);

create index if not exists disputes_fulfillment_channel_created_idx
  on public.disputes (fulfillment_channel, created_at desc);

create index if not exists disputes_channel_status_idx
  on public.disputes (fulfillment_channel, status, created_at desc);

comment on table public.disputes is
  'Buyer complaints for orders. Partitioned by fulfillment_channel (manual vs cj).';
comment on column public.disputes.fulfillment_channel is
  'Mirrors the related order: manual custom vs CJ Dropshipping complaints.';

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

-- Channel-partitioned views (only after base table exists)
create or replace view public.manual_disputes as
select * from public.disputes
where fulfillment_channel = 'manual'::public.fulfillment_channel;

create or replace view public.cj_disputes as
select * from public.disputes
where fulfillment_channel = 'cj'::public.fulfillment_channel;

comment on view public.manual_disputes is
  'Complaints for manual/custom orders.';
comment on view public.cj_disputes is
  'Complaints for CJ Dropshipping orders.';

grant select on public.disputes to authenticated, anon;
grant select on public.manual_disputes to authenticated, anon;
grant select on public.cj_disputes to authenticated, anon;

-- Keep channel in sync from the related order on insert/update
create or replace function public.trg_disputes_set_fulfillment_channel()
returns trigger
language plpgsql
as $$
declare
  v_channel public.fulfillment_channel;
begin
  begin
    select coalesce(fulfillment_channel, 'manual'::public.fulfillment_channel)
      into v_channel
    from public.orders
    where id = new.order_id;
  exception
    when undefined_column then
      v_channel := 'manual'::public.fulfillment_channel;
  end;

  new.fulfillment_channel := coalesce(v_channel, 'manual'::public.fulfillment_channel);
  return new;
end;
$$;

drop trigger if exists disputes_set_fulfillment_channel on public.disputes;
create trigger disputes_set_fulfillment_channel
  before insert or update of order_id on public.disputes
  for each row execute function public.trg_disputes_set_fulfillment_channel();

drop trigger if exists disputes_set_updated_at on public.disputes;
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'set_updated_at'
  ) then
    create trigger disputes_set_updated_at
      before update on public.disputes
      for each row execute function public.set_updated_at();
  end if;
end;
$$;

notify pgrst, 'reload schema';
