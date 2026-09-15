-- External dropshipping integrations: CJ Dropshipping + DSers/AliExpress
-- Credentials, fulfillment job queue, and paid-order auto-enqueue.

-- ---------------------------------------------------------------------------
-- Vendor API credentials (per supplier platform)
-- ---------------------------------------------------------------------------

create table if not exists public.vendor_supplier_credentials (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors (id) on delete cascade,
  provider_id uuid not null references public.supplier_providers (id) on delete cascade,
  api_key text,
  api_secret text,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  account_email text,
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vendor_id, provider_id)
);

create index if not exists vendor_supplier_credentials_vendor_idx
  on public.vendor_supplier_credentials (vendor_id);

comment on table public.vendor_supplier_credentials is
  'Per-vendor API credentials for CJ Dropshipping, DSers/AliExpress, etc.';

drop trigger if exists vendor_supplier_credentials_set_updated_at
  on public.vendor_supplier_credentials;
create trigger vendor_supplier_credentials_set_updated_at
  before update on public.vendor_supplier_credentials
  for each row execute function public.set_updated_at();

alter table public.vendor_supplier_credentials enable row level security;

drop policy if exists "vendor_supplier_credentials_owner_select"
  on public.vendor_supplier_credentials;
create policy "vendor_supplier_credentials_owner_select"
  on public.vendor_supplier_credentials for select
  using (public.owns_vendor(vendor_id) or public.is_admin());

drop policy if exists "vendor_supplier_credentials_owner_write"
  on public.vendor_supplier_credentials;
create policy "vendor_supplier_credentials_owner_write"
  on public.vendor_supplier_credentials for all
  using (public.owns_vendor(vendor_id) or public.is_admin())
  with check (public.owns_vendor(vendor_id) or public.is_admin());

-- ---------------------------------------------------------------------------
-- External catalog import audit
-- ---------------------------------------------------------------------------

create table if not exists public.external_product_imports (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors (id) on delete cascade,
  provider_id uuid not null references public.supplier_providers (id) on delete restrict,
  product_id uuid references public.products (id) on delete set null,
  external_product_id text not null,
  external_variant_id text,
  external_sku text,
  source_payload jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  unique (vendor_id, provider_id, external_product_id)
);

create index if not exists external_product_imports_product_idx
  on public.external_product_imports (product_id)
  where product_id is not null;

alter table public.external_product_imports enable row level security;

drop policy if exists "external_product_imports_owner_select"
  on public.external_product_imports;
create policy "external_product_imports_owner_select"
  on public.external_product_imports for select
  using (public.owns_vendor(vendor_id) or public.is_admin());

drop policy if exists "external_product_imports_owner_write"
  on public.external_product_imports;
create policy "external_product_imports_owner_write"
  on public.external_product_imports for all
  using (public.owns_vendor(vendor_id) or public.is_admin())
  with check (public.owns_vendor(vendor_id) or public.is_admin());

-- ---------------------------------------------------------------------------
-- Supplier fulfillment job queue (paid orders → CJ / DSers create-order)
-- ---------------------------------------------------------------------------

do $$
begin
  create type public.supplier_fulfillment_job_status as enum (
    'pending',
    'processing',
    'submitted',
    'failed',
    'skipped'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.supplier_fulfillment_jobs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  provider_id uuid references public.supplier_providers (id) on delete set null,
  provider_kind public.supplier_provider_kind,
  status public.supplier_fulfillment_job_status not null default 'pending',
  attempts integer not null default 0 check (attempts >= 0),
  supplier_order_ref text,
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  last_error text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, provider_id)
);

create index if not exists supplier_fulfillment_jobs_status_idx
  on public.supplier_fulfillment_jobs (status, created_at);

create index if not exists supplier_fulfillment_jobs_order_idx
  on public.supplier_fulfillment_jobs (order_id);

drop trigger if exists supplier_fulfillment_jobs_set_updated_at
  on public.supplier_fulfillment_jobs;
create trigger supplier_fulfillment_jobs_set_updated_at
  before update on public.supplier_fulfillment_jobs
  for each row execute function public.set_updated_at();

alter table public.supplier_fulfillment_jobs enable row level security;

drop policy if exists "supplier_fulfillment_jobs_select"
  on public.supplier_fulfillment_jobs;
create policy "supplier_fulfillment_jobs_select"
  on public.supplier_fulfillment_jobs for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.orders o
      where o.id = order_id
        and (
          public.owns_vendor(o.vendor_id)
          or public.owns_vendor(o.seller_vendor_id)
        )
    )
  );

-- Mutations via SECURITY DEFINER RPCs / service role only (no client write policies).

-- ---------------------------------------------------------------------------
-- enqueue_supplier_fulfillment_for_order
-- ---------------------------------------------------------------------------

create or replace function public.enqueue_supplier_fulfillment_for_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_provider public.supplier_providers%rowtype;
  v_kind public.supplier_provider_kind;
  v_job_id uuid;
  v_enqueued integer := 0;
  v_skipped integer := 0;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found';
  end if;

  if v_order.payment_status is distinct from 'paid' then
    return jsonb_build_object(
      'order_id', p_order_id,
      'enqueued', 0,
      'skipped', 0,
      'message', 'Order is not paid yet'
    );
  end if;

  -- Prefer provider stamped on line items; fall back to product routes.
  for v_provider in
    select distinct sp.*
    from public.order_items oi
    left join public.supplier_providers sp on sp.id = oi.supplier_provider_id
    where oi.order_id = p_order_id
      and sp.id is not null
      and sp.kind in ('cj_dropshipping', 'dsers')
      and sp.is_active = true
    union
    select distinct sp.*
    from public.order_items oi
    join public.product_supplier_routes r
      on r.id = oi.supplier_route_id
      or (
        oi.supplier_route_id is null
        and r.product_id = coalesce(oi.source_product_id, oi.listing_product_id, oi.product_id)
        and r.is_active = true
      )
    join public.supplier_providers sp on sp.id = r.provider_id
    where oi.order_id = p_order_id
      and sp.kind in ('cj_dropshipping', 'dsers')
      and sp.is_active = true
  loop
    v_kind := v_provider.kind;

    insert into public.supplier_fulfillment_jobs (
      order_id, provider_id, provider_kind, status, request_payload
    )
    values (
      p_order_id,
      v_provider.id,
      v_kind,
      'pending',
      jsonb_build_object(
        'order_id', p_order_id,
        'provider_slug', v_provider.slug,
        'provider_kind', v_kind::text
      )
    )
    on conflict (order_id, provider_id) do nothing
    returning id into v_job_id;

    if v_job_id is not null then
      v_enqueued := v_enqueued + 1;
      v_job_id := null;
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  if v_enqueued = 0 and v_skipped = 0 then
    -- No external provider routes — mark sync idle/skipped for operators.
    update public.orders
    set
      fulfillment_sync_status = coalesce(fulfillment_sync_status, 'idle'),
      updated_at = now()
    where id = p_order_id;

    return jsonb_build_object(
      'order_id', p_order_id,
      'enqueued', 0,
      'skipped', 0,
      'message', 'No external CJ/DSers routes on this order'
    );
  end if;

  update public.orders
  set
    fulfillment_sync_status = 'pending',
    fulfillment_sync_error = null,
    updated_at = now()
  where id = p_order_id;

  return jsonb_build_object(
    'order_id', p_order_id,
    'enqueued', v_enqueued,
    'skipped', v_skipped
  );
end;
$$;

revoke all on function public.enqueue_supplier_fulfillment_for_order(uuid) from public;
grant execute on function public.enqueue_supplier_fulfillment_for_order(uuid)
  to authenticated, service_role;

-- Auto-enqueue when an order flips to paid.
create or replace function public.orders_enqueue_supplier_fulfillment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.payment_status = 'paid'
     and (tg_op = 'INSERT' or old.payment_status is distinct from 'paid') then
    perform public.enqueue_supplier_fulfillment_for_order(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists orders_enqueue_supplier_fulfillment on public.orders;
create trigger orders_enqueue_supplier_fulfillment
  after insert or update of payment_status on public.orders
  for each row execute function public.orders_enqueue_supplier_fulfillment();

-- ---------------------------------------------------------------------------
-- claim + complete fulfillment jobs (worker / cron)
-- ---------------------------------------------------------------------------

create or replace function public.claim_supplier_fulfillment_jobs(p_limit integer default 20)
returns setof public.supplier_fulfillment_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_service_role() or public.is_admin()) then
    raise exception 'Only service role or admin can claim fulfillment jobs';
  end if;

  return query
  with picked as (
    select j.id
    from public.supplier_fulfillment_jobs j
    where j.status in ('pending', 'failed')
      and j.attempts < 8
    order by j.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  )
  update public.supplier_fulfillment_jobs j
  set
    status = 'processing',
    attempts = attempts + 1,
    updated_at = now()
  from picked
  where j.id = picked.id
  returning j.*;
end;
$$;

revoke all on function public.claim_supplier_fulfillment_jobs(integer) from public;
grant execute on function public.claim_supplier_fulfillment_jobs(integer)
  to authenticated, service_role;

create or replace function public.complete_supplier_fulfillment_job(
  p_job_id uuid,
  p_status public.supplier_fulfillment_job_status,
  p_supplier_order_ref text default null,
  p_response jsonb default '{}'::jsonb,
  p_error text default null
)
returns public.supplier_fulfillment_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.supplier_fulfillment_jobs%rowtype;
begin
  if not (public.is_service_role() or public.is_admin()) then
    raise exception 'Only service role or admin can complete fulfillment jobs';
  end if;

  update public.supplier_fulfillment_jobs
  set
    status = p_status,
    supplier_order_ref = coalesce(nullif(trim(p_supplier_order_ref), ''), supplier_order_ref),
    response_payload = coalesce(p_response, '{}'::jsonb),
    last_error = p_error,
    processed_at = case
      when p_status in ('submitted', 'skipped') then now()
      else processed_at
    end,
    updated_at = now()
  where id = p_job_id
  returning * into v_job;

  if not found then
    raise exception 'Fulfillment job not found';
  end if;

  if p_status = 'submitted' and v_job.supplier_order_ref is not null then
    perform public.sync_order_fulfillment(
      v_job.order_id,
      'processing'::public.order_status,
      null,
      null,
      null,
      v_job.supplier_order_ref,
      'system'::public.fulfillment_sync_source,
      coalesce(p_response, '{}'::jsonb),
      format('Auto-routed to %s', coalesce(v_job.provider_kind::text, 'supplier'))
    );

    update public.orders
    set
      fulfillment_sync_status = 'synced',
      fulfillment_synced_at = now(),
      fulfillment_sync_error = null,
      updated_at = now()
    where id = v_job.order_id;
  elsif p_status = 'failed' then
    update public.orders
    set
      fulfillment_sync_status = 'error',
      fulfillment_sync_error = left(coalesce(p_error, 'Supplier fulfillment failed'), 500),
      updated_at = now()
    where id = v_job.order_id;
  end if;

  return v_job;
end;
$$;

revoke all on function public.complete_supplier_fulfillment_job(
  uuid, public.supplier_fulfillment_job_status, text, jsonb, text
) from public;
grant execute on function public.complete_supplier_fulfillment_job(
  uuid, public.supplier_fulfillment_job_status, text, jsonb, text
) to authenticated, service_role;

comment on function public.enqueue_supplier_fulfillment_for_order(uuid) is
  'Queues CJ/DSers fulfillment jobs when an order is paid.';
comment on function public.claim_supplier_fulfillment_jobs(integer) is
  'Claims pending/failed supplier fulfillment jobs for the worker cron.';
comment on function public.complete_supplier_fulfillment_job(uuid, public.supplier_fulfillment_job_status, text, jsonb, text) is
  'Marks a supplier fulfillment job submitted/failed and syncs order tracking refs.';
