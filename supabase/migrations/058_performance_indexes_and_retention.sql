-- =============================================================================
-- 058_performance_indexes_and_retention.sql
--
-- Scalability: composite indexes for hot list/filter paths, plus a retention
-- helper used by the nightly cleanup cron to archive/purge lean operational tables.
-- Ends with NOTIFY pgrst, 'reload schema'.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Hot-path indexes (products / orders / imports / wallets / jobs)
-- ---------------------------------------------------------------------------

create index if not exists products_status_created_at_idx
  on public.products (status, created_at desc);

create index if not exists products_vendor_created_at_idx
  on public.products (vendor_id, created_at desc);

create index if not exists products_vendor_status_created_at_idx
  on public.products (vendor_id, status, created_at desc);

create index if not exists orders_created_at_idx
  on public.orders (created_at desc);

create index if not exists orders_payment_status_created_at_idx
  on public.orders (payment_status, created_at desc);

create index if not exists orders_customer_created_at_idx
  on public.orders (customer_id, created_at desc);

create index if not exists orders_vendor_created_at_idx
  on public.orders (vendor_id, created_at desc);

create index if not exists orders_seller_vendor_created_at_idx
  on public.orders (seller_vendor_id, created_at desc)
  where seller_vendor_id is not null;

create index if not exists orders_status_created_at_idx
  on public.orders (status, created_at desc);

create index if not exists external_product_imports_vendor_synced_idx
  on public.external_product_imports (vendor_id, last_synced_at desc nulls last);

create index if not exists external_product_imports_vendor_created_idx
  on public.external_product_imports (vendor_id, created_at desc);

create index if not exists wallet_transactions_status_type_created_idx
  on public.wallet_transactions (status, tx_type, created_at asc);

create index if not exists order_fulfillment_alerts_created_idx
  on public.order_fulfillment_alerts (created_at desc);

create index if not exists order_fulfillment_events_created_idx
  on public.order_fulfillment_events (created_at desc);

create index if not exists supplier_fulfillment_jobs_status_created_idx
  on public.supplier_fulfillment_jobs (status, created_at desc);

-- ---------------------------------------------------------------------------
-- 2) Retention / cleanup RPC (service_role / cron only)
-- ---------------------------------------------------------------------------

-- Ensure is_service_role exists for the retention guard (partial DBs).
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

create or replace function public.cleanup_operational_data(
  p_job_retention_days integer default 30,
  p_event_retention_days integer default 90,
  p_alert_retention_days integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jobs_deleted integer := 0;
  v_usdt_jobs_deleted integer := 0;
  v_events_deleted integer := 0;
  v_payment_events_deleted integer := 0;
  v_alerts_deleted integer := 0;
  v_now timestamptz := now();
begin
  if not (
    public.is_service_role()
    or public.is_admin()
  ) then
    raise exception 'Not allowed';
  end if;

  p_job_retention_days := greatest(7, least(coalesce(p_job_retention_days, 30), 365));
  p_event_retention_days := greatest(14, least(coalesce(p_event_retention_days, 90), 730));
  p_alert_retention_days := greatest(7, least(coalesce(p_alert_retention_days, 60), 365));

  -- Completed / failed supplier fulfillment jobs
  if to_regclass('public.supplier_fulfillment_jobs') is not null then
    delete from public.supplier_fulfillment_jobs
    where status::text in ('submitted', 'failed', 'skipped')
      and created_at < v_now - make_interval(days => p_job_retention_days);
    get diagnostics v_jobs_deleted = row_count;
  end if;

  -- Completed USDT wallet jobs
  if to_regclass('public.usdt_wallet_jobs') is not null then
    delete from public.usdt_wallet_jobs
    where status::text in ('completed', 'failed', 'cancelled', 'canceled', 'done')
      and created_at < v_now - make_interval(days => p_job_retention_days);
    get diagnostics v_usdt_jobs_deleted = row_count;
  end if;

  -- Old fulfillment audit events (keep recent trail)
  if to_regclass('public.order_fulfillment_events') is not null then
    delete from public.order_fulfillment_events
    where created_at < v_now - make_interval(days => p_event_retention_days);
    get diagnostics v_events_deleted = row_count;
  end if;

  -- USDT payment webhook/monitor payloads
  if to_regclass('public.usdt_payment_events') is not null then
    delete from public.usdt_payment_events
    where created_at < v_now - make_interval(days => p_event_retention_days);
    get diagnostics v_payment_events_deleted = row_count;
  end if;

  -- Stale fulfillment alerts
  if to_regclass('public.order_fulfillment_alerts') is not null then
    delete from public.order_fulfillment_alerts
    where created_at < v_now - make_interval(days => p_alert_retention_days);
    get diagnostics v_alerts_deleted = row_count;
  end if;

  return jsonb_build_object(
    'ok', true,
    'supplier_fulfillment_jobs_deleted', v_jobs_deleted,
    'usdt_wallet_jobs_deleted', v_usdt_jobs_deleted,
    'order_fulfillment_events_deleted', v_events_deleted,
    'usdt_payment_events_deleted', v_payment_events_deleted,
    'order_fulfillment_alerts_deleted', v_alerts_deleted,
    'job_retention_days', p_job_retention_days,
    'event_retention_days', p_event_retention_days,
    'alert_retention_days', p_alert_retention_days
  );
end;
$$;

revoke all on function public.cleanup_operational_data(integer, integer, integer) from public;
grant execute on function public.cleanup_operational_data(integer, integer, integer)
  to service_role;

comment on function public.cleanup_operational_data(integer, integer, integer) is
  'Cron/service-role retention purge for completed jobs, payment events, and stale alerts.';

notify pgrst, 'reload schema';
