-- =============================================================================
-- 052_ensure_wallets_for_supplier_refund.sql
--
-- refund_order_supplier_unavailable failed with:
--   relation "public.wallets" does not exist
--
-- Live DBs that skipped 010/022 still need USDT+MMK wallets (with escrow),
-- wallet_transactions, and order_escrow_ledger before that RPC can run.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0) Helpers that older partial DBs may lack
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

create or replace function public.is_service_role()
returns boolean
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  ) = 'service_role';
$$;

-- ---------------------------------------------------------------------------
-- 1) Wallet enums
-- ---------------------------------------------------------------------------

do $$
begin
  create type public.wallet_currency as enum ('USDT', 'MMK');
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.wallet_tx_type as enum (
    'deposit',
    'withdrawal',
    'purchase',
    'sale_credit',
    'adjustment'
  );
exception
  when duplicate_object then null;
end;
$$;

do $$ begin
  alter type public.wallet_tx_type add value if not exists 'escrow_hold';
exception when duplicate_object then null;
end $$;

do $$ begin
  alter type public.wallet_tx_type add value if not exists 'escrow_release';
exception when duplicate_object then null;
end $$;

do $$ begin
  alter type public.wallet_tx_type add value if not exists 'escrow_refund';
exception when duplicate_object then null;
end $$;

do $$ begin
  alter type public.wallet_tx_type add value if not exists 'inventory_fee';
exception when duplicate_object then null;
end $$;

do $$ begin
  alter type public.wallet_tx_type add value if not exists 'platform_commission';
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.wallet_tx_status as enum (
    'pending',
    'completed',
    'rejected',
    'cancelled'
  );
exception
  when duplicate_object then null;
end;
$$;

do $$ begin
  create type public.order_payout_status as enum (
    'held', 'released', 'not_applicable'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  alter type public.order_payout_status add value if not exists 'disputed';
exception when duplicate_object then null;
end $$;

do $$ begin
  alter type public.order_payout_status add value if not exists 'refunded';
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.order_escrow_role as enum ('supplier', 'seller', 'platform');
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- 2) wallets (USDT + MMK) + escrow_balance
-- ---------------------------------------------------------------------------

create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  currency public.wallet_currency not null,
  available_balance numeric(18, 6) not null default 0
    check (available_balance >= 0),
  pending_balance numeric(18, 6) not null default 0
    check (pending_balance >= 0),
  escrow_balance numeric(18, 6) not null default 0
    check (escrow_balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, currency)
);

alter table public.wallets
  add column if not exists available_balance numeric(18, 6) not null default 0;

alter table public.wallets
  add column if not exists pending_balance numeric(18, 6) not null default 0;

alter table public.wallets
  add column if not exists escrow_balance numeric(18, 6) not null default 0;

comment on table public.wallets is
  'Per-user USDT and MMK balances. USDT supports deposits/withdrawals/escrow; MMK is withdraw-only.';

comment on column public.wallets.escrow_balance is
  'USDT sale proceeds held until order delivery. Not withdrawable.';

create index if not exists wallets_user_id_idx on public.wallets (user_id);

drop trigger if exists wallets_set_updated_at on public.wallets;
create trigger wallets_set_updated_at
  before update on public.wallets
  for each row execute function public.set_updated_at();

alter table public.wallets enable row level security;

drop policy if exists "wallets_select_own_or_admin" on public.wallets;
create policy "wallets_select_own_or_admin"
  on public.wallets for select
  using (user_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- 3) wallet_transactions (canonical columns used by refund RPCs)
-- ---------------------------------------------------------------------------

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  currency public.wallet_currency not null,
  tx_type public.wallet_tx_type not null,
  status public.wallet_tx_status not null default 'pending',
  amount numeric(18, 6) not null check (amount > 0),
  destination text,
  reference text,
  note text,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Backfill columns if an older/partial wallet_transactions table exists.
alter table public.wallet_transactions
  add column if not exists user_id uuid references public.profiles (id) on delete cascade;

alter table public.wallet_transactions
  add column if not exists currency public.wallet_currency;

alter table public.wallet_transactions
  add column if not exists tx_type public.wallet_tx_type;

alter table public.wallet_transactions
  add column if not exists status public.wallet_tx_status default 'pending';

alter table public.wallet_transactions
  add column if not exists amount numeric(18, 6);

alter table public.wallet_transactions
  add column if not exists destination text;

alter table public.wallet_transactions
  add column if not exists reference text;

alter table public.wallet_transactions
  add column if not exists note text;

alter table public.wallet_transactions
  add column if not exists reviewed_by uuid references public.profiles (id) on delete set null;

alter table public.wallet_transactions
  add column if not exists reviewed_at timestamptz;

alter table public.wallet_transactions
  add column if not exists created_at timestamptz not null default now();

alter table public.wallet_transactions
  add column if not exists updated_at timestamptz not null default now();

create index if not exists wallet_transactions_user_id_idx
  on public.wallet_transactions (user_id, created_at desc);
create index if not exists wallet_transactions_wallet_id_idx
  on public.wallet_transactions (wallet_id, created_at desc);
create index if not exists wallet_transactions_status_idx
  on public.wallet_transactions (status);

drop trigger if exists wallet_transactions_set_updated_at on public.wallet_transactions;
create trigger wallet_transactions_set_updated_at
  before update on public.wallet_transactions
  for each row execute function public.set_updated_at();

alter table public.wallet_transactions enable row level security;

drop policy if exists "wallet_transactions_select_own_or_admin" on public.wallet_transactions;
create policy "wallet_transactions_select_own_or_admin"
  on public.wallet_transactions for select
  using (user_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- 4) ensure_user_wallets
-- ---------------------------------------------------------------------------

create or replace function public.ensure_user_wallets(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    raise exception 'user_id is required';
  end if;

  if auth.uid() is not null
     and auth.uid() is distinct from p_user_id
     and not public.is_admin()
     and not public.is_service_role() then
    raise exception 'Not allowed to ensure wallets for another user';
  end if;

  insert into public.wallets (user_id, currency)
  values
    (p_user_id, 'USDT'),
    (p_user_id, 'MMK')
  on conflict (user_id, currency) do nothing;
end;
$$;

revoke all on function public.ensure_user_wallets(uuid) from public;
grant execute on function public.ensure_user_wallets(uuid)
  to authenticated, service_role;

-- Backfill wallets for existing profiles
insert into public.wallets (user_id, currency)
select p.id, c.currency
from public.profiles p
cross join (
  values
    ('USDT'::public.wallet_currency),
    ('MMK'::public.wallet_currency)
) as c(currency)
on conflict (user_id, currency) do nothing;

-- ---------------------------------------------------------------------------
-- 5) order_escrow_ledger (required by refund path)
-- ---------------------------------------------------------------------------

create table if not exists public.order_escrow_ledger (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  beneficiary_user_id uuid not null references public.profiles (id) on delete restrict,
  role public.order_escrow_role not null,
  amount_usdt numeric(18, 6) not null check (amount_usdt > 0),
  status text not null default 'held'
    check (status in ('held', 'released', 'refunded')),
  hold_tx_id uuid references public.wallet_transactions (id) on delete set null,
  release_tx_id uuid references public.wallet_transactions (id) on delete set null,
  created_at timestamptz not null default now(),
  released_at timestamptz,
  unique (order_id, role, beneficiary_user_id)
);

-- Widen status check if an older table only allowed held/released.
do $$
begin
  alter table public.order_escrow_ledger
    drop constraint if exists order_escrow_ledger_status_check;
exception when undefined_object then null;
end;
$$;

alter table public.order_escrow_ledger
  drop constraint if exists order_escrow_ledger_status_check;

alter table public.order_escrow_ledger
  add constraint order_escrow_ledger_status_check
  check (status in ('held', 'released', 'refunded'));

create index if not exists order_escrow_ledger_order_id_idx
  on public.order_escrow_ledger (order_id);

alter table public.order_escrow_ledger enable row level security;

-- ---------------------------------------------------------------------------
-- 6) Recreate refund_order_supplier_unavailable now that wallets exist
-- ---------------------------------------------------------------------------

create or replace function public.refund_order_supplier_unavailable(
  p_order_id uuid,
  p_note text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_order public.orders%rowtype;
  v_prev public.order_status;
  v_buyer_wallet public.wallets%rowtype;
  v_ben_wallet public.wallets%rowtype;
  v_entry public.order_escrow_ledger%rowtype;
  v_tx_id uuid;
  v_refunded numeric(18, 6) := 0;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if v_user is null and not public.is_service_role() then
    raise exception 'Authentication required';
  end if;

  if to_regclass('public.wallets') is null then
    raise exception
      'public.wallets is missing. Run migration 052_ensure_wallets_for_supplier_refund.sql (or 010_wallets_usdt_mmk.sql).';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if not (
    public.is_service_role()
    or public.is_admin()
    or public.owns_vendor(v_order.vendor_id)
    or public.owns_vendor(v_order.seller_vendor_id)
  ) then
    raise exception 'Not allowed to refund this order';
  end if;

  if v_order.status not in ('out_of_stock', 'fulfillment_failed') then
    raise exception
      'Only out_of_stock or fulfillment_failed orders can use this refund path (current: %)',
      v_order.status;
  end if;

  if v_order.payment_status not in ('paid', 'refunded') then
    v_prev := v_order.status;
    update public.orders
    set
      status = 'cancelled',
      updated_at = now()
    where id = p_order_id
    returning * into v_order;

    insert into public.order_fulfillment_events (
      order_id, source, previous_status, new_status, payload, note, created_by
    ) values (
      p_order_id,
      'manual'::public.fulfillment_sync_source,
      v_prev,
      'cancelled',
      jsonb_build_object('event', 'supplier_unavailable_cancel'),
      coalesce(v_note, 'Cancelled — supplier unavailable (unpaid)'),
      v_user
    );

    if to_regclass('public.order_fulfillment_alerts') is not null then
      update public.order_fulfillment_alerts
      set acknowledged_at = now(), acknowledged_by = v_user
      where order_id = p_order_id and acknowledged_at is null;
    end if;

    return v_order;
  end if;

  if v_order.payment_status = 'refunded' or v_order.status = 'refunded' then
    return v_order;
  end if;

  v_prev := v_order.status;

  perform public.ensure_user_wallets(v_order.customer_id);

  select * into v_buyer_wallet
  from public.wallets
  where user_id = v_order.customer_id and currency = 'USDT'
  for update;

  if not found then
    raise exception 'Buyer USDT wallet missing';
  end if;

  for v_entry in
    select *
    from public.order_escrow_ledger
    where order_id = v_order.id and status = 'held'
    for update
  loop
    -- Bootstrap beneficiary wallets without ensure_user_wallets IDOR checks.
    insert into public.wallets (user_id, currency)
    values
      (v_entry.beneficiary_user_id, 'USDT'),
      (v_entry.beneficiary_user_id, 'MMK')
    on conflict (user_id, currency) do nothing;

    select * into v_ben_wallet
    from public.wallets
    where user_id = v_entry.beneficiary_user_id and currency = 'USDT'
    for update;

    if not found then
      raise exception 'Beneficiary wallet missing for %', v_entry.beneficiary_user_id;
    end if;

    if v_ben_wallet.escrow_balance < v_entry.amount_usdt then
      raise exception 'Insufficient escrow balance to refund';
    end if;

    update public.wallets
    set
      escrow_balance = escrow_balance - v_entry.amount_usdt,
      updated_at = now()
    where id = v_ben_wallet.id;

    insert into public.wallet_transactions (
      wallet_id, user_id, currency, tx_type, status, amount, reference, note,
      reviewed_by, reviewed_at
    ) values (
      v_ben_wallet.id,
      v_entry.beneficiary_user_id,
      'USDT',
      'escrow_refund',
      'completed',
      v_entry.amount_usdt,
      v_order.id::text,
      format('Supplier unavailable refund — escrow clawback from %s', v_entry.role::text),
      v_user,
      now()
    );

    update public.wallets
    set
      available_balance = available_balance + v_entry.amount_usdt,
      updated_at = now()
    where id = v_buyer_wallet.id
    returning * into v_buyer_wallet;

    insert into public.wallet_transactions (
      wallet_id, user_id, currency, tx_type, status, amount, reference, note,
      reviewed_by, reviewed_at
    ) values (
      v_buyer_wallet.id,
      v_order.customer_id,
      'USDT',
      'escrow_refund',
      'completed',
      v_entry.amount_usdt,
      v_order.id::text,
      format('Supplier unavailable — refund credited (%s)', coalesce(v_note, v_prev::text)),
      v_user,
      now()
    )
    returning id into v_tx_id;

    update public.order_escrow_ledger
    set
      status = 'refunded',
      release_tx_id = v_tx_id,
      released_at = now()
    where id = v_entry.id;

    v_refunded := v_refunded + v_entry.amount_usdt;
  end loop;

  update public.orders
  set
    status = 'refunded',
    payment_status = 'refunded',
    payout_status = 'refunded',
    payout_released_at = now(),
    payout_release_source = 'supplier_unavailable_refund',
    fulfillment_sync_error = left(
      coalesce(v_note, fulfillment_sync_error, 'Refunded — supplier unavailable'),
      500
    ),
    updated_at = now()
  where id = p_order_id
  returning * into v_order;

  insert into public.order_fulfillment_events (
    order_id, source, previous_status, new_status, payload, note, created_by
  ) values (
    p_order_id,
    'manual'::public.fulfillment_sync_source,
    v_prev,
    'refunded',
    jsonb_build_object(
      'event', 'supplier_unavailable_refund',
      'refunded_usdt', v_refunded
    ),
    coalesce(
      v_note,
      format('Refunded %.6f USDT to buyer (supplier unavailable)', v_refunded)
    ),
    v_user
  );

  if to_regclass('public.order_fulfillment_alerts') is not null then
    update public.order_fulfillment_alerts
    set acknowledged_at = now(), acknowledged_by = v_user
    where order_id = p_order_id and acknowledged_at is null;
  end if;

  return v_order;
end;
$$;

revoke all on function public.refund_order_supplier_unavailable(uuid, text) from public;
grant execute on function public.refund_order_supplier_unavailable(uuid, text)
  to authenticated, service_role;

comment on function public.refund_order_supplier_unavailable(uuid, text) is
  'Cancel/refund a paid order that failed supplier stock check. Requires public.wallets (USDT/MMK).';

notify pgrst, 'reload schema';
