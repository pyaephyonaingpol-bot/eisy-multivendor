-- Monthly inventory-fee cron support + fee/withdrawal audit trails
-- - Service-role-safe monthly charge runner with charge-run audit log
-- - Invoice charged_by / charge_run_id provenance
-- - Withdrawal review continues to use reviewed_by / reviewed_at / note

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_service_role()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'role', '') = 'service_role';
$$;

comment on function public.is_service_role() is
  'True when the caller uses the Supabase service_role JWT (cron / background workers).';

-- ---------------------------------------------------------------------------
-- Fee charge run audit log
-- ---------------------------------------------------------------------------

do $$
begin
  create type public.dropship_fee_charge_trigger as enum ('cron', 'admin', 'vendor');
exception
  when duplicate_object then null;
end;
$$;

create table if not exists public.dropship_fee_charge_runs (
  id uuid primary key default gen_random_uuid(),
  billing_month date not null,
  trigger_source public.dropship_fee_charge_trigger not null,
  triggered_by uuid references public.profiles (id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  paid_count integer not null default 0 check (paid_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  total_charged_usdt numeric(18, 6) not null default 0 check (total_charged_usdt >= 0),
  errors jsonb not null default '[]'::jsonb,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists dropship_fee_charge_runs_month_idx
  on public.dropship_fee_charge_runs (billing_month desc, started_at desc);

comment on table public.dropship_fee_charge_runs is
  'Audit log for monthly dropship inventory fee billing runs (cron or admin).';

alter table public.dropship_fee_charge_runs enable row level security;

drop policy if exists "dropship_fee_charge_runs_admin_select"
  on public.dropship_fee_charge_runs;
create policy "dropship_fee_charge_runs_admin_select"
  on public.dropship_fee_charge_runs for select
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Invoice provenance columns
-- ---------------------------------------------------------------------------

alter table public.dropship_inventory_fee_invoices
  add column if not exists charged_by uuid references public.profiles (id) on delete set null;

alter table public.dropship_inventory_fee_invoices
  add column if not exists charge_run_id uuid
    references public.dropship_fee_charge_runs (id) on delete set null;

create index if not exists dropship_inventory_fee_invoices_charge_run_idx
  on public.dropship_inventory_fee_invoices (charge_run_id)
  where charge_run_id is not null;

comment on column public.dropship_inventory_fee_invoices.charged_by is
  'Admin/vendor user who triggered the charge; null for automated cron.';
comment on column public.dropship_inventory_fee_invoices.charge_run_id is
  'Links the invoice to a fee charge run for auditability.';

-- ---------------------------------------------------------------------------
-- charge_dropship_inventory_fee — allow service_role + charge_run audit
-- Drop prior 2-arg overload so defaulted 3-arg signature is unambiguous.
-- ---------------------------------------------------------------------------

drop function if exists public.charge_dropship_inventory_fee(uuid, date);

create or replace function public.charge_dropship_inventory_fee(
  p_vendor_id uuid,
  p_billing_month date default null,
  p_charge_run_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month date := public.billing_month_start(coalesce(p_billing_month, current_date));
  v_settings public.dropship_fee_settings%rowtype;
  v_vendor public.vendors%rowtype;
  v_active integer;
  v_billable integer;
  v_amount numeric(18, 6);
  v_invoice public.dropship_inventory_fee_invoices%rowtype;
  v_wallet public.wallets%rowtype;
  v_tx_id uuid;
  v_platform_user_id uuid;
  v_platform_wallet public.wallets%rowtype;
  v_actor uuid := auth.uid();
  v_is_service boolean := public.is_service_role();
begin
  if v_actor is null and not v_is_service then
    raise exception 'Not authenticated';
  end if;

  if not (
    v_is_service
    or public.is_admin()
    or public.owns_vendor(p_vendor_id)
  ) then
    raise exception 'Not allowed to charge inventory fees for this vendor';
  end if;

  select * into v_vendor from public.vendors where id = p_vendor_id;
  if not found then
    raise exception 'Vendor not found';
  end if;

  if not public.vendor_is_dropshipper(p_vendor_id) then
    raise exception 'Vendor has no dropship listings';
  end if;

  select * into v_settings from public.dropship_fee_settings where id = 1;
  v_active := public.count_active_dropship_items(p_vendor_id);
  if v_active > 0 then
    v_billable := greatest(v_active, v_settings.min_billable_items);
    v_amount := round(v_billable * v_settings.item_fee_usdt, 6);
  else
    v_billable := 0;
    v_amount := 0;
  end if;

  select * into v_invoice
  from public.dropship_inventory_fee_invoices
  where vendor_id = p_vendor_id
    and billing_month = v_month
  for update;

  if found and v_invoice.status = 'paid' then
    return jsonb_build_object(
      'invoice_id', v_invoice.id,
      'status', 'paid',
      'amount_usdt', v_invoice.amount_usdt,
      'message', 'Already paid for this billing month'
    );
  end if;

  if not found then
    insert into public.dropship_inventory_fee_invoices (
      vendor_id,
      billing_month,
      active_item_count,
      billable_item_count,
      unit_fee_usdt,
      amount_usdt,
      status,
      charge_run_id
    )
    values (
      p_vendor_id,
      v_month,
      v_active,
      v_billable,
      v_settings.item_fee_usdt,
      v_amount,
      'pending',
      p_charge_run_id
    )
    returning * into v_invoice;
  else
    update public.dropship_inventory_fee_invoices
    set
      active_item_count = v_active,
      billable_item_count = v_billable,
      unit_fee_usdt = v_settings.item_fee_usdt,
      amount_usdt = v_amount,
      status = 'pending',
      note = null,
      charge_run_id = coalesce(p_charge_run_id, charge_run_id),
      updated_at = now()
    where id = v_invoice.id
    returning * into v_invoice;
  end if;

  if v_amount <= 0 then
    update public.dropship_inventory_fee_invoices
    set
      status = 'waived',
      charged_at = now(),
      charged_by = v_actor,
      charge_run_id = coalesce(p_charge_run_id, charge_run_id),
      note = 'Zero amount'
    where id = v_invoice.id
    returning * into v_invoice;

    return jsonb_build_object(
      'invoice_id', v_invoice.id,
      'status', v_invoice.status,
      'amount_usdt', 0
    );
  end if;

  perform public.ensure_user_wallets(v_vendor.owner_id);

  select * into v_wallet
  from public.wallets
  where user_id = v_vendor.owner_id and currency = 'USDT'
  for update;

  if not found then
    raise exception 'USDT wallet not found';
  end if;

  if v_wallet.available_balance < v_amount then
    update public.dropship_inventory_fee_invoices
    set
      status = 'failed',
      note = 'Insufficient USDT balance',
      charge_run_id = coalesce(p_charge_run_id, charge_run_id),
      updated_at = now()
    where id = v_invoice.id;

    raise exception
      'Insufficient USDT balance for monthly inventory fee (% USDT required for % billable items)',
      v_amount,
      v_billable;
  end if;

  update public.wallets
  set available_balance = available_balance - v_amount
  where id = v_wallet.id;

  insert into public.wallet_transactions (
    wallet_id, user_id, currency, tx_type, status, amount, reference, note
  )
  values (
    v_wallet.id,
    v_vendor.owner_id,
    'USDT',
    'inventory_fee',
    'completed',
    v_amount,
    v_invoice.id::text,
    format(
      'Dropship inventory fee %s: %s active → %s billable × %s USDT%s',
      to_char(v_month, 'YYYY-MM'),
      v_active,
      v_billable,
      v_settings.item_fee_usdt,
      case when v_is_service then ' (cron)' else '' end
    )
  )
  returning id into v_tx_id;

  v_platform_user_id := public.get_platform_treasury_user_id();
  if v_platform_user_id is not null then
    perform public.ensure_user_wallets(v_platform_user_id);
    select * into v_platform_wallet
    from public.wallets
    where user_id = v_platform_user_id and currency = 'USDT'
    for update;

    if found then
      update public.wallets
      set available_balance = available_balance + v_amount
      where id = v_platform_wallet.id;

      insert into public.wallet_transactions (
        wallet_id, user_id, currency, tx_type, status, amount, reference, note
      )
      values (
        v_platform_wallet.id,
        v_platform_user_id,
        'USDT',
        'inventory_fee',
        'completed',
        v_amount,
        v_invoice.id::text,
        format(
          'Inventory fee collected from vendor %s for %s%s',
          p_vendor_id,
          to_char(v_month, 'YYYY-MM'),
          case when v_is_service then ' (cron)' else '' end
        )
      );
    end if;
  end if;

  update public.dropship_inventory_fee_invoices
  set
    status = 'paid',
    wallet_transaction_id = v_tx_id,
    charged_at = now(),
    charged_by = v_actor,
    charge_run_id = coalesce(p_charge_run_id, charge_run_id),
    note = null,
    updated_at = now()
  where id = v_invoice.id
  returning * into v_invoice;

  return jsonb_build_object(
    'invoice_id', v_invoice.id,
    'status', 'paid',
    'billing_month', v_month,
    'active_item_count', v_active,
    'billable_item_count', v_billable,
    'amount_usdt', v_amount,
    'wallet_transaction_id', v_tx_id,
    'charge_run_id', p_charge_run_id
  );
end;
$$;

grant execute on function public.charge_dropship_inventory_fee(uuid, date, uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- charge_all_dropship_inventory_fees — cron/admin with run audit row
-- ---------------------------------------------------------------------------

drop function if exists public.charge_all_dropship_inventory_fees(date);

create or replace function public.charge_all_dropship_inventory_fees(
  p_billing_month date default null,
  p_trigger_source public.dropship_fee_charge_trigger default 'admin',
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month date := public.billing_month_start(coalesce(p_billing_month, current_date));
  v_vendor record;
  v_paid integer := 0;
  v_failed integer := 0;
  v_skipped integer := 0;
  v_total numeric(18, 6) := 0;
  v_errors jsonb := '[]'::jsonb;
  v_result jsonb;
  v_run_id uuid;
  v_is_service boolean := public.is_service_role();
  v_actor uuid := auth.uid();
  v_source public.dropship_fee_charge_trigger := coalesce(p_trigger_source, 'admin');
begin
  if not (public.is_admin() or v_is_service) then
    raise exception 'Only admins or the billing cron can charge all inventory fees';
  end if;

  if v_is_service then
    v_source := 'cron';
    v_actor := null;
  elsif v_source = 'cron' then
    v_source := 'admin';
  end if;

  insert into public.dropship_fee_charge_runs (
    billing_month,
    trigger_source,
    triggered_by,
    note
  )
  values (
    v_month,
    v_source,
    v_actor,
    p_note
  )
  returning id into v_run_id;

  for v_vendor in
    select distinct v.id
    from public.vendors v
    join public.products p on p.vendor_id = v.id
    where coalesce(p.is_dropship, false) = true
      and p.status = 'active'
      and v.status = 'approved'
    order by v.id
  loop
    begin
      v_result := public.charge_dropship_inventory_fee(
        v_vendor.id,
        v_month,
        v_run_id
      );
      if (v_result->>'status') = 'paid' then
        v_paid := v_paid + 1;
        v_total := v_total + coalesce((v_result->>'amount_usdt')::numeric, 0);
      else
        v_skipped := v_skipped + 1;
      end if;
    exception when others then
      v_failed := v_failed + 1;
      v_errors := v_errors || jsonb_build_array(
        jsonb_build_object('vendor_id', v_vendor.id, 'error', SQLERRM)
      );
    end;
  end loop;

  update public.dropship_fee_charge_runs
  set
    finished_at = now(),
    paid_count = v_paid,
    failed_count = v_failed,
    skipped_count = v_skipped,
    total_charged_usdt = v_total,
    errors = v_errors
  where id = v_run_id;

  return jsonb_build_object(
    'billing_month', v_month,
    'paid', v_paid,
    'failed', v_failed,
    'skipped', v_skipped,
    'total_charged_usdt', v_total,
    'errors', v_errors,
    'charge_run_id', v_run_id,
    'trigger_source', v_source
  );
end;
$$;

grant execute on function public.charge_all_dropship_inventory_fees(
  date,
  public.dropship_fee_charge_trigger,
  text
) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Withdrawal review audit comments (columns already exist from 010)
-- ---------------------------------------------------------------------------

comment on column public.wallet_transactions.reviewed_by is
  'Admin who approved or rejected the deposit/withdrawal.';
comment on column public.wallet_transactions.reviewed_at is
  'When the deposit/withdrawal was approved or rejected.';
comment on column public.wallet_transactions.note is
  'Requester note and/or admin review note (updated on review).';
