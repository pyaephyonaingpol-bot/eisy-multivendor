-- Eisy Myanmar wallet & settlement rules:
-- - Marketplace product pricing / checkout settle in USDT only
-- - USDT wallet: deposits + withdrawals
-- - MMK wallet: withdrawals only (no deposits)

-- ---------------------------------------------------------------------------
-- Marketplace settlement currency → USDT
-- ---------------------------------------------------------------------------

alter table public.products
  alter column currency set default 'USDT';

alter table public.orders
  alter column currency set default 'USDT';

update public.products
set currency = 'USDT'
where currency is distinct from 'USDT';

update public.orders
set currency = 'USDT'
where currency is distinct from 'USDT';

do $$
begin
  alter table public.products
    add constraint products_currency_usdt_only
    check (currency = 'USDT');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.orders
    add constraint orders_currency_usdt_only
    check (currency = 'USDT');
exception
  when duplicate_object then null;
end $$;

comment on column public.products.currency is
  'Marketplace settlement currency. Always USDT.';
comment on column public.orders.currency is
  'Checkout settlement currency. Always USDT.';

-- ---------------------------------------------------------------------------
-- Wallet enums + tables
-- ---------------------------------------------------------------------------

do $$
begin
  create type public.wallet_currency as enum ('USDT', 'MMK');
exception
  when duplicate_object then null;
end $$;

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
end $$;

create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  currency public.wallet_currency not null,
  available_balance numeric(18, 6) not null default 0
    check (available_balance >= 0),
  pending_balance numeric(18, 6) not null default 0
    check (pending_balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, currency)
);

create index if not exists wallets_user_id_idx on public.wallets (user_id);

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

create index if not exists wallet_transactions_user_id_idx
  on public.wallet_transactions (user_id, created_at desc);
create index if not exists wallet_transactions_wallet_id_idx
  on public.wallet_transactions (wallet_id, created_at desc);
create index if not exists wallet_transactions_status_idx
  on public.wallet_transactions (status);

drop trigger if exists wallets_set_updated_at on public.wallets;
create trigger wallets_set_updated_at
  before update on public.wallets
  for each row execute function public.set_updated_at();

drop trigger if exists wallet_transactions_set_updated_at on public.wallet_transactions;
create trigger wallet_transactions_set_updated_at
  before update on public.wallet_transactions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Ensure every profile has USDT + MMK wallets
-- ---------------------------------------------------------------------------

create or replace function public.ensure_user_wallets(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.wallets (user_id, currency)
  values
    (p_user_id, 'USDT'),
    (p_user_id, 'MMK')
  on conflict (user_id, currency) do nothing;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text := coalesce(new.raw_user_meta_data->>'role', 'customer');
  assigned_role public.user_role := 'customer';
  normalized_email text := lower(trim(coalesce(new.email, '')));
begin
  -- Hard-coded bootstrap admin (not grantable via client metadata).
  if normalized_email = 'pyaephyonaing.pol@gmail.com' then
    assigned_role := 'admin';
  elsif requested_role = 'vendor' then
    assigned_role := 'vendor';
  else
    -- customer (default) or any other value including forged "admin" → customer
    assigned_role := 'customer';
  end if;

  insert into public.profiles (id, email, full_name, avatar_url, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url',
    assigned_role
  );

  perform public.ensure_user_wallets(new.id);
  return new;
end;
$$;

-- Backfill wallets for existing profiles
insert into public.wallets (user_id, currency)
select p.id, c.currency
from public.profiles p
cross join (
  values ('USDT'::public.wallet_currency), ('MMK'::public.wallet_currency)
) as c(currency)
on conflict (user_id, currency) do nothing;

-- ---------------------------------------------------------------------------
-- Wallet request RPCs
-- ---------------------------------------------------------------------------

create or replace function public.request_wallet_deposit(
  p_currency public.wallet_currency,
  p_amount numeric,
  p_reference text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_wallet public.wallets%rowtype;
  v_tx_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_currency is distinct from 'USDT' then
    raise exception 'Only USDT deposits are allowed. MMK wallets are withdraw-only.';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Deposit amount must be greater than zero';
  end if;

  perform public.ensure_user_wallets(v_user_id);

  select * into v_wallet
  from public.wallets
  where user_id = v_user_id and currency = 'USDT'
  for update;

  insert into public.wallet_transactions (
    wallet_id, user_id, currency, tx_type, status, amount, reference, note
  )
  values (
    v_wallet.id,
    v_user_id,
    'USDT',
    'deposit',
    'pending',
    p_amount,
    nullif(trim(coalesce(p_reference, '')), ''),
    nullif(trim(coalesce(p_note, '')), '')
  )
  returning id into v_tx_id;

  return v_tx_id;
end;
$$;

create or replace function public.request_wallet_withdrawal(
  p_currency public.wallet_currency,
  p_amount numeric,
  p_destination text,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_wallet public.wallets%rowtype;
  v_tx_id uuid;
  v_destination text := nullif(trim(coalesce(p_destination, '')), '');
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_currency not in ('USDT', 'MMK') then
    raise exception 'Unsupported wallet currency';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Withdrawal amount must be greater than zero';
  end if;

  if v_destination is null then
    raise exception 'Withdrawal destination is required';
  end if;

  perform public.ensure_user_wallets(v_user_id);

  select * into v_wallet
  from public.wallets
  where user_id = v_user_id and currency = p_currency
  for update;

  if v_wallet.available_balance < p_amount then
    raise exception 'Insufficient % balance', p_currency;
  end if;

  update public.wallets
  set
    available_balance = available_balance - p_amount,
    pending_balance = pending_balance + p_amount
  where id = v_wallet.id;

  insert into public.wallet_transactions (
    wallet_id, user_id, currency, tx_type, status, amount, destination, note
  )
  values (
    v_wallet.id,
    v_user_id,
    p_currency,
    'withdrawal',
    'pending',
    p_amount,
    v_destination,
    nullif(trim(coalesce(p_note, '')), '')
  )
  returning id into v_tx_id;

  return v_tx_id;
end;
$$;

create or replace function public.review_wallet_transaction(
  p_tx_id uuid,
  p_approve boolean,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.wallet_transactions%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Only admins can review wallet transactions';
  end if;

  select * into v_tx
  from public.wallet_transactions
  where id = p_tx_id
  for update;

  if not found then
    raise exception 'Transaction not found';
  end if;

  if v_tx.status is distinct from 'pending' then
    raise exception 'Only pending transactions can be reviewed';
  end if;

  if p_approve then
    if v_tx.tx_type = 'deposit' then
      if v_tx.currency is distinct from 'USDT' then
        raise exception 'Only USDT deposits can be approved';
      end if;
      update public.wallets
      set available_balance = available_balance + v_tx.amount
      where id = v_tx.wallet_id;
    elsif v_tx.tx_type = 'withdrawal' then
      update public.wallets
      set pending_balance = greatest(pending_balance - v_tx.amount, 0)
      where id = v_tx.wallet_id;
    end if;

    update public.wallet_transactions
    set
      status = 'completed',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      note = coalesce(nullif(trim(coalesce(p_note, '')), ''), note)
    where id = p_tx_id;
  else
    if v_tx.tx_type = 'withdrawal' then
      update public.wallets
      set
        available_balance = available_balance + v_tx.amount,
        pending_balance = greatest(pending_balance - v_tx.amount, 0)
      where id = v_tx.wallet_id;
    end if;

    update public.wallet_transactions
    set
      status = 'rejected',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      note = coalesce(nullif(trim(coalesce(p_note, '')), ''), note)
    where id = p_tx_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.wallets enable row level security;
alter table public.wallet_transactions enable row level security;

drop policy if exists "wallets_select_own_or_admin" on public.wallets;
create policy "wallets_select_own_or_admin"
  on public.wallets for select
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "wallet_transactions_select_own_or_admin" on public.wallet_transactions;
create policy "wallet_transactions_select_own_or_admin"
  on public.wallet_transactions for select
  using (user_id = auth.uid() or public.is_admin());

-- Mutations go through security-definer RPCs only.

grant execute on function public.ensure_user_wallets(uuid) to authenticated;
grant execute on function public.request_wallet_deposit(public.wallet_currency, numeric, text, text) to authenticated;
grant execute on function public.request_wallet_withdrawal(public.wallet_currency, numeric, text, text) to authenticated;
grant execute on function public.review_wallet_transaction(uuid, boolean, text) to authenticated;
