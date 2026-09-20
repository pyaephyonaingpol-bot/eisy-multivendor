-- =============================================================================
-- 051_cj_fulfillment_stock_failure.sql
--
-- When CJ (or another supplier) is out of stock at fulfillment time:
--   1) order.status → out_of_stock | fulfillment_failed
--   2) audit event + vendor/admin alert row
--   3) clear cancel/refund path via refund_order_supplier_unavailable
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Extend order_status enum
-- ---------------------------------------------------------------------------

do $$
begin
  alter type public.order_status add value 'out_of_stock';
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter type public.order_status add value 'fulfillment_failed';
exception
  when duplicate_object then null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Alerts for vendors / admins (in-app notification feed)
-- ---------------------------------------------------------------------------

create table if not exists public.order_fulfillment_alerts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  vendor_id uuid references public.vendors (id) on delete set null,
  alert_kind text not null
    check (alert_kind in ('out_of_stock', 'fulfillment_failed')),
  title text not null,
  body text not null,
  payload jsonb not null default '{}'::jsonb,
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists order_fulfillment_alerts_order_idx
  on public.order_fulfillment_alerts (order_id, created_at desc);

create index if not exists order_fulfillment_alerts_vendor_idx
  on public.order_fulfillment_alerts (vendor_id, created_at desc)
  where acknowledged_at is null;

alter table public.order_fulfillment_alerts enable row level security;

drop policy if exists "order_fulfillment_alerts_select" on public.order_fulfillment_alerts;
create policy "order_fulfillment_alerts_select"
  on public.order_fulfillment_alerts for select
  using (
    public.is_admin()
    or (vendor_id is not null and public.owns_vendor(vendor_id))
  );

drop policy if exists "order_fulfillment_alerts_update" on public.order_fulfillment_alerts;
create policy "order_fulfillment_alerts_update"
  on public.order_fulfillment_alerts for update
  using (
    public.is_admin()
    or (vendor_id is not null and public.owns_vendor(vendor_id))
  )
  with check (
    public.is_admin()
    or (vendor_id is not null and public.owns_vendor(vendor_id))
  );

-- ---------------------------------------------------------------------------
-- 3) Mark stock / fulfillment failure (called by worker after CJ stock check)
-- ---------------------------------------------------------------------------

create or replace function public.mark_order_supplier_stock_issue(
  p_order_id uuid,
  p_job_id uuid default null,
  p_issue text default 'out_of_stock',
  p_error text default null,
  p_payload jsonb default '{}'::jsonb
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_prev public.order_status;
  v_new public.order_status;
  v_issue text := lower(nullif(trim(coalesce(p_issue, '')), ''));
  v_error text := left(coalesce(nullif(trim(coalesce(p_error, '')), ''), 'Supplier stock unavailable'), 500);
  v_seller uuid;
  v_fulfill uuid;
begin
  if not (public.is_service_role() or public.is_admin()) then
    raise exception 'Only service role or admin can mark supplier stock issues';
  end if;

  if v_issue is null or v_issue not in ('out_of_stock', 'fulfillment_failed') then
    v_issue := 'out_of_stock';
  end if;

  v_new := v_issue::public.order_status;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  -- Do not overwrite terminal outcomes.
  if v_order.status in ('shipped', 'delivered', 'cancelled', 'refunded') then
    return v_order;
  end if;

  v_prev := v_order.status;

  update public.orders
  set
    status = v_new,
    fulfillment_sync_status = 'error',
    fulfillment_sync_error = v_error,
    updated_at = now()
  where id = p_order_id
  returning * into v_order;

  if p_job_id is not null then
    update public.supplier_fulfillment_jobs
    set
      status = 'failed',
      last_error = v_error,
      response_payload = coalesce(p_payload, '{}'::jsonb),
      processed_at = now(),
      updated_at = now()
    where id = p_job_id;
  end if;

  insert into public.order_fulfillment_events (
    order_id, source, previous_status, new_status, payload, note, created_by
  ) values (
    p_order_id,
    'system'::public.fulfillment_sync_source,
    v_prev,
    v_new,
    coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('issue', v_issue),
    v_error,
    null
  );

  v_seller := v_order.seller_vendor_id;
  v_fulfill := v_order.vendor_id;

  -- Notify seller (dropshipper) and fulfillment vendor when distinct.
  insert into public.order_fulfillment_alerts (
    order_id, vendor_id, alert_kind, title, body, payload
  )
  select
    p_order_id,
    v.id,
    v_issue,
    case
      when v_issue = 'out_of_stock' then 'Supplier out of stock'
      else 'Supplier fulfillment failed'
    end,
    format(
      'Order %s cannot be fulfilled via the supplier (%s). Cancel and refund the buyer from Admin → Orders or Vendor → Orders.',
      left(p_order_id::text, 8),
      v_error
    ),
    coalesce(p_payload, '{}'::jsonb)
  from public.vendors v
  where v.id in (v_seller, v_fulfill);

  return v_order;
end;
$$;

revoke all on function public.mark_order_supplier_stock_issue(uuid, uuid, text, text, jsonb) from public;
grant execute on function public.mark_order_supplier_stock_issue(uuid, uuid, text, text, jsonb)
  to authenticated, service_role;

comment on function public.mark_order_supplier_stock_issue(uuid, uuid, text, text, jsonb) is
  'Flags an order out_of_stock / fulfillment_failed after a live supplier stock check fails, writes audit + alerts.';

-- ---------------------------------------------------------------------------
-- 4) Cancel + refund path for stock / fulfillment failures
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
    -- Unpaid: just cancel.
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

    update public.order_fulfillment_alerts
    set acknowledged_at = now(), acknowledged_by = v_user
    where order_id = p_order_id and acknowledged_at is null;

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

  -- If no escrow rows (legacy), still mark refunded so ops can reconcile off-chain.
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

  update public.order_fulfillment_alerts
  set acknowledged_at = now(), acknowledged_by = v_user
  where order_id = p_order_id and acknowledged_at is null;

  return v_order;
end;
$$;

revoke all on function public.refund_order_supplier_unavailable(uuid, text) from public;
grant execute on function public.refund_order_supplier_unavailable(uuid, text)
  to authenticated, service_role;

comment on function public.refund_order_supplier_unavailable(uuid, text) is
  'Cancel/refund a paid order that failed supplier stock check (out_of_stock / fulfillment_failed).';

notify pgrst, 'reload schema';
