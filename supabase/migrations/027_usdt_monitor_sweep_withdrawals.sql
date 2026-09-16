-- =============================================================================
-- 027_usdt_monitor_sweep_withdrawals.sql
--
-- USDT TRC-20 deposit monitoring support, stale intent expiry,
-- wallet sweep jobs, and vendor/dropshipper payout broadcast queue.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Settings: cold/sweep destination + ops mode hint
-- ---------------------------------------------------------------------------

alter table public.usdt_payment_settings
  add column if not exists sweep_destination_address text;

alter table public.usdt_payment_settings
  add column if not exists auto_sweep_enabled boolean not null default false;

alter table public.usdt_payment_settings
  add column if not exists min_sweep_amount_usdt numeric(18, 6) not null default 50;

comment on column public.usdt_payment_settings.sweep_destination_address is
  'Cold / treasury TRON address for automated sweeps from the deposit hot wallet.';

-- ---------------------------------------------------------------------------
-- 2) Expire stale pending payment intents + unpaid orders
-- ---------------------------------------------------------------------------

create or replace function public.expire_stale_usdt_payment_intents(
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_intent record;
  v_expired integer := 0;
  v_orders integer := 0;
  v_order_count integer := 0;
begin
  if not public.is_service_role() and not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  for v_intent in
    select id, order_ids
    from public.usdt_payment_intents
    where status in ('pending', 'detecting')
      and expires_at < now()
    order by expires_at asc
    limit greatest(1, least(coalesce(p_limit, 100), 500))
    for update skip locked
  loop
    update public.usdt_payment_intents
    set
      status = 'expired',
      updated_at = now()
    where id = v_intent.id
      and status in ('pending', 'detecting');

    if found then
      v_expired := v_expired + 1;

      insert into public.usdt_payment_events (
        payment_intent_id, event_type, payload
      ) values (
        v_intent.id,
        'expired',
        jsonb_build_object('source', 'expire_stale_usdt_payment_intents')
      );

      update public.orders
      set
        status = 'cancelled',
        payment_status = 'failed',
        updated_at = now()
      where id = any (v_intent.order_ids)
        and payment_status = 'pending'
        and status = 'pending';

      get diagnostics v_order_count = row_count;
      v_orders := v_orders + v_order_count;
    end if;
  end loop;

  return jsonb_build_object(
    'expired_intents', v_expired,
    'cancelled_orders', v_orders
  );
end;
$$;

revoke all on function public.expire_stale_usdt_payment_intents(integer) from public;
grant execute on function public.expire_stale_usdt_payment_intents(integer) to service_role;

-- Mark intent detecting (monitor claimed a candidate tx)
create or replace function public.mark_usdt_payment_intent_detecting(
  p_payment_intent_id uuid,
  p_tx_hash text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.usdt_payment_intents
  set
    status = 'detecting',
    tx_hash = coalesce(tx_hash, nullif(trim(p_tx_hash), '')),
    updated_at = now()
  where id = p_payment_intent_id
    and status = 'pending';

  if found then
    insert into public.usdt_payment_events (
      payment_intent_id, event_type, payload
    ) values (
      p_payment_intent_id,
      'detecting',
      jsonb_build_object(
        'source', 'monitor',
        'tx_hash', nullif(trim(p_tx_hash), '')
      )
    );
    return true;
  end if;

  return false;
end;
$$;

revoke all on function public.mark_usdt_payment_intent_detecting(uuid, text) from public;
grant execute on function public.mark_usdt_payment_intent_detecting(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 3) Sweep + payout job queues
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.usdt_wallet_job_status as enum (
    'queued',
    'processing',
    'completed',
    'failed',
    'cancelled'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.usdt_wallet_job_kind as enum (
    'sweep',
    'withdrawal_payout'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.usdt_wallet_jobs (
  id uuid primary key default gen_random_uuid(),
  kind public.usdt_wallet_job_kind not null,
  status public.usdt_wallet_job_status not null default 'queued',
  amount_usdt numeric(18, 6) not null check (amount_usdt > 0),
  from_address text,
  to_address text not null,
  -- Optional links
  payment_intent_id uuid references public.usdt_payment_intents (id) on delete set null,
  wallet_transaction_id uuid references public.wallet_transactions (id) on delete set null,
  beneficiary_user_id uuid references public.profiles (id) on delete set null,
  -- Chain result
  tx_hash text,
  confirmations integer,
  attempts integer not null default 0,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (wallet_transaction_id)
);

create index if not exists usdt_wallet_jobs_status_idx
  on public.usdt_wallet_jobs (status, kind, created_at);

create index if not exists usdt_wallet_jobs_kind_queued_idx
  on public.usdt_wallet_jobs (kind, created_at)
  where status = 'queued';

alter table public.usdt_wallet_jobs enable row level security;

drop policy if exists "usdt_wallet_jobs_admin_select" on public.usdt_wallet_jobs;
create policy "usdt_wallet_jobs_admin_select"
  on public.usdt_wallet_jobs for select
  using (
    public.is_admin()
    or beneficiary_user_id = auth.uid()
  );

-- Enqueue a sweep after a confirmed TRC-20 checkout (optional)
create or replace function public.enqueue_usdt_sweep_job(
  p_payment_intent_id uuid,
  p_amount_usdt numeric,
  p_to_address text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.usdt_payment_settings%rowtype;
  v_dest text;
  v_job_id uuid;
begin
  select * into v_settings from public.usdt_payment_settings where id = 1;
  if not found or not coalesce(v_settings.auto_sweep_enabled, false) then
    return null;
  end if;

  v_dest := nullif(trim(coalesce(p_to_address, v_settings.sweep_destination_address)), '');
  if v_dest is null then
    return null;
  end if;

  if p_amount_usdt is null
     or p_amount_usdt < coalesce(v_settings.min_sweep_amount_usdt, 50) then
    return null;
  end if;

  insert into public.usdt_wallet_jobs (
    kind,
    status,
    amount_usdt,
    from_address,
    to_address,
    payment_intent_id,
    metadata
  ) values (
    'sweep',
    'queued',
    p_amount_usdt,
    v_settings.deposit_address,
    v_dest,
    p_payment_intent_id,
    jsonb_build_object('source', 'enqueue_usdt_sweep_job')
  )
  returning id into v_job_id;

  return v_job_id;
end;
$$;

revoke all on function public.enqueue_usdt_sweep_job(uuid, numeric, text) from public;
grant execute on function public.enqueue_usdt_sweep_job(uuid, numeric, text) to service_role;

-- Enqueue payout after admin approves a USDT withdrawal
create or replace function public.enqueue_usdt_withdrawal_payout(
  p_wallet_transaction_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.wallet_transactions%rowtype;
  v_settings public.usdt_payment_settings%rowtype;
  v_job_id uuid;
  v_dest text;
begin
  select * into v_tx
  from public.wallet_transactions
  where id = p_wallet_transaction_id;

  if not found then
    raise exception 'Wallet transaction not found';
  end if;

  if v_tx.tx_type is distinct from 'withdrawal' then
    raise exception 'Not a withdrawal transaction';
  end if;

  if upper(v_tx.currency::text) is distinct from 'USDT' then
    return null; -- MMK / local payouts stay off-chain
  end if;

  if v_tx.status is distinct from 'completed' and v_tx.status is distinct from 'pending' then
    -- Allow enqueue right after approval (completed) or while still pending review
    null;
  end if;

  v_dest := nullif(trim(coalesce(v_tx.destination, '')), '');
  if v_dest is null then
    raise exception 'Withdrawal has no destination address';
  end if;

  select * into v_settings from public.usdt_payment_settings where id = 1;

  insert into public.usdt_wallet_jobs (
    kind,
    status,
    amount_usdt,
    from_address,
    to_address,
    wallet_transaction_id,
    beneficiary_user_id,
    metadata
  ) values (
    'withdrawal_payout',
    'queued',
    abs(v_tx.amount),
    coalesce(v_settings.deposit_address, null),
    v_dest,
    v_tx.id,
    v_tx.user_id,
    jsonb_build_object(
      'source', 'enqueue_usdt_withdrawal_payout',
      'note', v_tx.note
    )
  )
  on conflict (wallet_transaction_id) do update
    set updated_at = now()
  returning id into v_job_id;

  return v_job_id;
end;
$$;

revoke all on function public.enqueue_usdt_withdrawal_payout(uuid) from public;
grant execute on function public.enqueue_usdt_withdrawal_payout(uuid) to service_role;
grant execute on function public.enqueue_usdt_withdrawal_payout(uuid) to authenticated;

-- Claim next queued jobs for the worker
create or replace function public.claim_usdt_wallet_jobs(
  p_limit integer default 10,
  p_kind public.usdt_wallet_job_kind default null
)
returns setof public.usdt_wallet_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with picked as (
    select j.id
    from public.usdt_wallet_jobs j
    where j.status = 'queued'
      and (p_kind is null or j.kind = p_kind)
    order by j.created_at asc
    limit greatest(1, least(coalesce(p_limit, 10), 50))
    for update skip locked
  )
  update public.usdt_wallet_jobs j
  set
    status = 'processing',
    attempts = j.attempts + 1,
    updated_at = now()
  from picked
  where j.id = picked.id
  returning j.*;
end;
$$;

revoke all on function public.claim_usdt_wallet_jobs(integer, public.usdt_wallet_job_kind) from public;
grant execute on function public.claim_usdt_wallet_jobs(integer, public.usdt_wallet_job_kind) to service_role;

create or replace function public.complete_usdt_wallet_job(
  p_job_id uuid,
  p_tx_hash text,
  p_confirmations integer default 1,
  p_error text default null
)
returns public.usdt_wallet_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.usdt_wallet_jobs%rowtype;
begin
  if p_error is not null and nullif(trim(p_error), '') is not null then
    update public.usdt_wallet_jobs
    set
      status = case when attempts >= 5 then 'failed' else 'queued' end,
      last_error = trim(p_error),
      updated_at = now()
    where id = p_job_id
    returning * into v_job;
    return v_job;
  end if;

  update public.usdt_wallet_jobs
  set
    status = 'completed',
    tx_hash = nullif(trim(p_tx_hash), ''),
    confirmations = coalesce(p_confirmations, 1),
    last_error = null,
    processed_at = now(),
    updated_at = now()
  where id = p_job_id
  returning * into v_job;

  if v_job.wallet_transaction_id is not null and v_job.tx_hash is not null then
    update public.wallet_transactions
    set
      reference = coalesce(nullif(trim(reference), ''), v_job.tx_hash),
      note = case
        when note is null or note = '' then 'Broadcast tx: ' || v_job.tx_hash
        when position(v_job.tx_hash in note) > 0 then note
        else note || ' | Broadcast tx: ' || v_job.tx_hash
      end
    where id = v_job.wallet_transaction_id;
  end if;

  return v_job;
end;
$$;

revoke all on function public.complete_usdt_wallet_job(uuid, text, integer, text) from public;
grant execute on function public.complete_usdt_wallet_job(uuid, text, integer, text) to service_role;
