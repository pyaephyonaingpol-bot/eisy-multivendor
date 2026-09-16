-- =============================================================================
-- 028_dispute_resolution_admin.sql
--
-- Buyer disputes pause escrow release; admins can refund the buyer or release
-- funds to the seller. Also adds set_profile_role for admin user management.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Enums / columns
-- ---------------------------------------------------------------------------

do $$ begin
  alter type public.order_payout_status add value 'disputed';
exception when duplicate_object then null;
end $$;

do $$ begin
  alter type public.order_payout_status add value 'refunded';
exception when duplicate_object then null;
end $$;

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

-- Allow ledger rows to be marked refunded
do $$
begin
  alter table public.order_escrow_ledger
    drop constraint if exists order_escrow_ledger_status_check;
exception when undefined_object then null;
end $$;

alter table public.order_escrow_ledger
  drop constraint if exists order_escrow_ledger_status_check;

alter table public.order_escrow_ledger
  add constraint order_escrow_ledger_status_check
  check (status in ('held', 'released', 'refunded'));

-- wallet_tx_type: escrow_refund (if enum exists)
do $$ begin
  alter type public.wallet_tx_type add value 'escrow_refund';
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- 2) disputes table
-- ---------------------------------------------------------------------------

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
          or (o.seller_vendor_id is not null and public.owns_vendor(o.seller_vendor_id))
        )
    )
  );

-- Mutations via SECURITY DEFINER RPCs only.

-- ---------------------------------------------------------------------------
-- 3) Patch release_order_escrow — block while disputed
-- ---------------------------------------------------------------------------

create or replace function public.release_order_escrow(
  p_order_id uuid,
  p_source text default 'delivery',
  p_actor uuid default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_entry public.order_escrow_ledger%rowtype;
  v_wallet public.wallets%rowtype;
  v_tx_id uuid;
  v_released numeric(18, 6) := 0;
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if v_order.payout_status = 'released' then
    return v_order;
  end if;

  if v_order.payout_status = 'refunded' then
    raise exception 'Escrow already refunded for this order';
  end if;

  if v_order.payout_status = 'disputed'
     and coalesce(p_source, '') not like 'dispute_resolve%' then
    raise exception 'Escrow release paused — this order has an open dispute';
  end if;

  if v_order.payment_status is distinct from 'paid' then
    raise exception 'Only paid orders can release escrow (payment_status=%)', v_order.payment_status;
  end if;

  -- Dispute resolution may release without delivered; normal path still requires delivered.
  if v_order.status is distinct from 'delivered'
     and coalesce(p_source, '') not like 'dispute_resolve%' then
    raise exception 'Escrow releases only when order status is delivered (status=%)', v_order.status;
  end if;

  for v_entry in
    select *
    from public.order_escrow_ledger
    where order_id = p_order_id and status = 'held'
    for update
  loop
    select * into v_wallet
    from public.wallets
    where user_id = v_entry.beneficiary_user_id and currency = 'USDT'
    for update;

    if not found then
      raise exception 'USDT wallet missing for beneficiary %', v_entry.beneficiary_user_id;
    end if;

    if v_wallet.escrow_balance < v_entry.amount_usdt then
      raise exception
        'Escrow balance %.6f is less than held amount %.6f for order %',
        v_wallet.escrow_balance, v_entry.amount_usdt, p_order_id;
    end if;

    update public.wallets
    set
      escrow_balance = escrow_balance - v_entry.amount_usdt,
      available_balance = available_balance + v_entry.amount_usdt,
      updated_at = now()
    where id = v_wallet.id;

    insert into public.wallet_transactions (
      wallet_id, user_id, currency, tx_type, status, amount, reference, note
    ) values (
      v_wallet.id,
      v_entry.beneficiary_user_id,
      'USDT',
      'escrow_release',
      'completed',
      v_entry.amount_usdt,
      p_order_id::text,
      format(
        'Escrow released to available balance (%s via %s)',
        v_entry.role::text,
        coalesce(p_source, 'delivery')
      )
    )
    returning id into v_tx_id;

    update public.order_escrow_ledger
    set
      status = 'released',
      release_tx_id = v_tx_id,
      released_at = now()
    where id = v_entry.id;

    v_released := v_released + v_entry.amount_usdt;
  end loop;

  update public.orders
  set
    payout_status = 'released',
    payout_released_at = now(),
    payout_release_source = left(coalesce(p_source, 'delivery'), 120),
    updated_at = now()
  where id = p_order_id
  returning * into v_order;

  insert into public.order_fulfillment_events (
    order_id,
    source,
    previous_status,
    new_status,
    payload,
    note,
    created_by
  ) values (
    p_order_id,
    'system'::public.fulfillment_sync_source,
    v_order.status,
    v_order.status,
    jsonb_build_object(
      'event', 'escrow_release',
      'released_usdt', v_released,
      'source', coalesce(p_source, 'delivery'),
      'actor', p_actor
    ),
    format('Released %.6f USDT from escrow to available balances', v_released),
    p_actor
  );

  return v_order;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) open_order_dispute — buyer raises issue, pauses escrow
-- ---------------------------------------------------------------------------

create or replace function public.open_order_dispute(
  p_order_id uuid,
  p_reason public.dispute_reason,
  p_description text default null
)
returns public.disputes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_order public.orders%rowtype;
  v_dispute public.disputes%rowtype;
begin
  if v_user is null then
    raise exception 'Sign in to open a dispute';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if v_order.customer_id is distinct from v_user then
    raise exception 'Only the buyer can open a dispute for this order';
  end if;

  if v_order.payment_status is distinct from 'paid' then
    raise exception 'Only paid orders can be disputed';
  end if;

  if v_order.payout_status = 'released' then
    raise exception 'Escrow already released — dispute window is closed';
  end if;

  if v_order.payout_status = 'refunded' then
    raise exception 'Order already refunded';
  end if;

  if v_order.status in ('cancelled', 'refunded') then
    raise exception 'Cannot dispute a % order', v_order.status;
  end if;

  if exists (
    select 1 from public.disputes d
    where d.order_id = p_order_id
      and d.status in ('open', 'under_review')
  ) then
    raise exception 'An open dispute already exists for this order';
  end if;

  insert into public.disputes (
    order_id, opened_by, reason, description, status
  ) values (
    p_order_id,
    v_user,
    p_reason,
    nullif(trim(coalesce(p_description, '')), ''),
    'open'
  )
  returning * into v_dispute;

  -- Pause escrow release timer / auto-release paths
  update public.orders
  set
    payout_status = 'disputed',
    updated_at = now()
  where id = p_order_id;

  insert into public.order_fulfillment_events (
    order_id, source, previous_status, new_status, payload, note, created_by
  ) values (
    p_order_id,
    'system'::public.fulfillment_sync_source,
    v_order.status,
    v_order.status,
    jsonb_build_object(
      'event', 'dispute_opened',
      'dispute_id', v_dispute.id,
      'reason', p_reason::text
    ),
    format('Buyer opened dispute (%s) — escrow release paused', p_reason::text),
    v_user
  );

  return v_dispute;
end;
$$;

revoke all on function public.open_order_dispute(uuid, public.dispute_reason, text) from public;
grant execute on function public.open_order_dispute(uuid, public.dispute_reason, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) resolve_dispute_refund_buyer — return escrow to buyer
-- ---------------------------------------------------------------------------

create or replace function public.resolve_dispute_refund_buyer(
  p_dispute_id uuid,
  p_note text default null
)
returns public.disputes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_dispute public.disputes%rowtype;
  v_order public.orders%rowtype;
  v_entry public.order_escrow_ledger%rowtype;
  v_ben_wallet public.wallets%rowtype;
  v_buyer_wallet public.wallets%rowtype;
  v_tx_id uuid;
  v_refunded numeric(18, 6) := 0;
begin
  if v_user is null or not public.is_admin() then
    raise exception 'Only admins can resolve disputes';
  end if;

  select * into v_dispute
  from public.disputes
  where id = p_dispute_id
  for update;

  if not found then
    raise exception 'Dispute not found';
  end if;

  if v_dispute.status not in ('open', 'under_review') then
    raise exception 'Dispute is already resolved';
  end if;

  select * into v_order
  from public.orders
  where id = v_dispute.order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  -- Ensure buyer wallet
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

    -- Debit beneficiary escrow
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
      format('Dispute refund — escrow clawback from %s (balance reduced)', v_entry.role::text),
      v_user,
      now()
    );

    -- Credit buyer available
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
      format('Dispute refund credited from %s escrow', v_entry.role::text),
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
    payout_release_source = 'dispute_refund',
    updated_at = now()
  where id = v_order.id;

  update public.disputes
  set
    status = 'resolved_refund',
    resolution_note = nullif(trim(coalesce(p_note, '')), ''),
    resolved_by = v_user,
    resolved_at = now(),
    updated_at = now()
  where id = p_dispute_id
  returning * into v_dispute;

  insert into public.order_fulfillment_events (
    order_id, source, previous_status, new_status, payload, note, created_by
  ) values (
    v_order.id,
    'system'::public.fulfillment_sync_source,
    v_order.status,
    'refunded',
    jsonb_build_object(
      'event', 'dispute_resolved_refund',
      'dispute_id', p_dispute_id,
      'refunded_usdt', v_refunded
    ),
    format('Admin refunded %.6f USDT to buyer (dispute resolved)', v_refunded),
    v_user
  );

  return v_dispute;
end;
$$;

revoke all on function public.resolve_dispute_refund_buyer(uuid, text) from public;
grant execute on function public.resolve_dispute_refund_buyer(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6) resolve_dispute_release_seller — release escrow to sellers
-- ---------------------------------------------------------------------------

create or replace function public.resolve_dispute_release_seller(
  p_dispute_id uuid,
  p_note text default null
)
returns public.disputes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_dispute public.disputes%rowtype;
  v_order public.orders%rowtype;
begin
  if v_user is null or not public.is_admin() then
    raise exception 'Only admins can resolve disputes';
  end if;

  select * into v_dispute
  from public.disputes
  where id = p_dispute_id
  for update;

  if not found then
    raise exception 'Dispute not found';
  end if;

  if v_dispute.status not in ('open', 'under_review') then
    raise exception 'Dispute is already resolved';
  end if;

  select * into v_order
  from public.orders
  where id = v_dispute.order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  -- Mark delivered if still in transit so release path is consistent
  if v_order.status is distinct from 'delivered'
     and v_order.status not in ('cancelled', 'refunded') then
    update public.orders
    set
      status = 'delivered',
      delivered_at = coalesce(delivered_at, now()),
      updated_at = now()
    where id = v_order.id
    returning * into v_order;
  end if;

  -- Clear disputed flag so release_order_escrow accepts dispute_resolve source
  update public.orders
  set
    payout_status = 'held',
    updated_at = now()
  where id = v_order.id
    and payout_status = 'disputed';

  perform public.release_order_escrow(
    v_order.id,
    'dispute_resolve_release',
    v_user
  );

  update public.disputes
  set
    status = 'resolved_release',
    resolution_note = nullif(trim(coalesce(p_note, '')), ''),
    resolved_by = v_user,
    resolved_at = now(),
    updated_at = now()
  where id = p_dispute_id
  returning * into v_dispute;

  insert into public.order_fulfillment_events (
    order_id, source, previous_status, new_status, payload, note, created_by
  ) values (
    v_order.id,
    'system'::public.fulfillment_sync_source,
    v_order.status,
    'delivered',
    jsonb_build_object(
      'event', 'dispute_resolved_release',
      'dispute_id', p_dispute_id
    ),
    'Admin released escrow to seller (dispute resolved in seller favor)',
    v_user
  );

  return v_dispute;
end;
$$;

revoke all on function public.resolve_dispute_release_seller(uuid, text) from public;
grant execute on function public.resolve_dispute_release_seller(uuid, text) to authenticated;

-- Mark dispute under review (admin triage)
create or replace function public.mark_dispute_under_review(
  p_dispute_id uuid
)
returns public.disputes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dispute public.disputes%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Only admins can update disputes';
  end if;

  update public.disputes
  set
    status = 'under_review',
    updated_at = now()
  where id = p_dispute_id
    and status = 'open'
  returning * into v_dispute;

  if not found then
    raise exception 'Dispute not found or not open';
  end if;

  return v_dispute;
end;
$$;

revoke all on function public.mark_dispute_under_review(uuid) from public;
grant execute on function public.mark_dispute_under_review(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7) Patch confirm_order_delivered_by_buyer — block when disputed
-- ---------------------------------------------------------------------------

create or replace function public.confirm_order_delivered_by_buyer(
  p_order_id uuid
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_prev public.order_status;
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Sign in to confirm delivery';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if v_order.customer_id is distinct from v_user then
    raise exception 'Only the buyer can confirm delivery for this order';
  end if;

  if v_order.payment_status is distinct from 'paid' then
    raise exception 'Order is not paid yet';
  end if;

  if v_order.payout_status = 'disputed' then
    raise exception 'Delivery confirmation is paused while a dispute is open';
  end if;

  if v_order.status in ('cancelled', 'refunded') then
    raise exception 'Cannot confirm delivery for a % order', v_order.status;
  end if;

  v_prev := v_order.status;

  if v_order.status is distinct from 'delivered' then
    update public.orders
    set
      status = 'delivered',
      delivered_at = coalesce(delivered_at, now()),
      updated_at = now()
    where id = p_order_id
    returning * into v_order;

    insert into public.order_fulfillment_events (
      order_id, source, previous_status, new_status, payload, note, created_by
    ) values (
      p_order_id,
      'manual'::public.fulfillment_sync_source,
      v_prev,
      'delivered',
      jsonb_build_object('event', 'buyer_confirm_delivery'),
      'Buyer confirmed delivery',
      v_user
    );
  end if;

  if v_order.payout_status = 'held' then
    return public.release_order_escrow(p_order_id, 'buyer_confirm', v_user);
  end if;

  return v_order;
end;
$$;

revoke all on function public.confirm_order_delivered_by_buyer(uuid) from public;
grant execute on function public.confirm_order_delivered_by_buyer(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8) Admin role management
-- ---------------------------------------------------------------------------

create or replace function public.set_profile_role(
  p_user_id uuid,
  p_role public.user_role
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Only admins can change user roles';
  end if;

  if p_user_id = auth.uid() and p_role is distinct from 'admin' then
    raise exception 'Admins cannot demote themselves';
  end if;

  update public.profiles
  set
    role = p_role,
    updated_at = now()
  where id = p_user_id
  returning * into v_profile;

  if not found then
    raise exception 'Profile not found';
  end if;

  return v_profile;
end;
$$;

revoke all on function public.set_profile_role(uuid, public.user_role) from public;
grant execute on function public.set_profile_role(uuid, public.user_role) to authenticated;
