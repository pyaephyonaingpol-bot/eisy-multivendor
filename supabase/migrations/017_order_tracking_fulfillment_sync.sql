-- Buyer tracking + supplier auto-fulfillment sync foundation

do $$
begin
  create type public.fulfillment_sync_source as enum (
    'manual',
    'supplier_webhook',
    'supplier_poll',
    'system'
  );
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.fulfillment_sync_status as enum (
    'idle',
    'pending',
    'synced',
    'error'
  );
exception
  when duplicate_object then null;
end;
$$;

alter table public.orders
  add column if not exists tracking_number text,
  add column if not exists tracking_carrier text,
  add column if not exists tracking_url text,
  add column if not exists shipped_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists supplier_order_ref text,
  add column if not exists fulfillment_sync_status public.fulfillment_sync_status
    not null default 'idle',
  add column if not exists fulfillment_synced_at timestamptz,
  add column if not exists fulfillment_sync_error text;

comment on column public.orders.tracking_number is
  'Parcel tracking number shown to buyers.';
comment on column public.orders.tracking_carrier is
  'Carrier label (DHL, Myanmar Post, CJ Express, etc.).';
comment on column public.orders.tracking_url is
  'Optional carrier tracking URL.';
comment on column public.orders.supplier_order_ref is
  'External supplier fulfillment id used by auto-sync workers.';
comment on column public.orders.fulfillment_sync_status is
  'Last supplier auto-fulfillment sync outcome.';

create index if not exists orders_tracking_number_idx
  on public.orders (tracking_number)
  where tracking_number is not null;

create index if not exists orders_supplier_order_ref_idx
  on public.orders (supplier_order_ref)
  where supplier_order_ref is not null;

create index if not exists orders_fulfillment_sync_status_idx
  on public.orders (fulfillment_sync_status, updated_at desc);

create table if not exists public.order_fulfillment_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  source public.fulfillment_sync_source not null default 'manual',
  previous_status public.order_status,
  new_status public.order_status,
  tracking_number text,
  tracking_carrier text,
  tracking_url text,
  supplier_order_ref text,
  payload jsonb not null default '{}'::jsonb,
  note text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists order_fulfillment_events_order_idx
  on public.order_fulfillment_events (order_id, created_at desc);

comment on table public.order_fulfillment_events is
  'Audit trail for order status and tracking updates (manual or supplier sync).';

alter table public.order_fulfillment_events enable row level security;

drop policy if exists "order_fulfillment_events_select"
  on public.order_fulfillment_events;
create policy "order_fulfillment_events_select"
  on public.order_fulfillment_events for select
  using (
    exists (
      select 1
      from public.orders o
      where o.id = order_id
        and (
          o.customer_id = auth.uid()
          or public.owns_vendor(o.vendor_id)
          or public.owns_vendor(o.seller_vendor_id)
          or public.is_admin()
        )
    )
  );

create or replace function public.sync_order_fulfillment(
  p_order_id uuid,
  p_status public.order_status default null,
  p_tracking_number text default null,
  p_tracking_carrier text default null,
  p_tracking_url text default null,
  p_supplier_order_ref text default null,
  p_source public.fulfillment_sync_source default 'manual',
  p_payload jsonb default '{}'::jsonb,
  p_note text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_prev public.order_status;
  v_new public.order_status;
  v_source public.fulfillment_sync_source := coalesce(p_source, 'manual');
  v_is_service boolean := public.is_service_role();
  v_actor uuid := auth.uid();
  v_tracking text;
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  if not (
    v_is_service
    or public.is_admin()
    or public.owns_vendor(v_order.vendor_id)
  ) then
    raise exception 'Not allowed to update fulfillment for this order.';
  end if;

  v_prev := v_order.status;
  v_new := coalesce(p_status, v_order.status);

  if p_status is not null then
    v_order.status := p_status;
  end if;

  if p_tracking_number is not null then
    v_tracking := nullif(trim(p_tracking_number), '');
    v_order.tracking_number := v_tracking;
  end if;

  if p_tracking_carrier is not null then
    v_order.tracking_carrier := nullif(trim(p_tracking_carrier), '');
  end if;

  if p_tracking_url is not null then
    v_order.tracking_url := nullif(trim(p_tracking_url), '');
  end if;

  if p_supplier_order_ref is not null then
    v_order.supplier_order_ref := nullif(trim(p_supplier_order_ref), '');
  end if;

  -- Auto-advance to shipped when tracking arrives while paid/processing.
  if v_order.tracking_number is not null
     and v_order.status in ('paid', 'processing')
     and p_status is null then
    v_order.status := 'shipped';
    v_new := 'shipped';
  end if;

  if v_order.status = 'shipped' and v_order.shipped_at is null then
    v_order.shipped_at := now();
  end if;

  if v_order.status = 'delivered' then
    v_order.shipped_at := coalesce(v_order.shipped_at, now());
    v_order.delivered_at := coalesce(v_order.delivered_at, now());
  end if;

  if v_source in ('supplier_webhook', 'supplier_poll') then
    v_order.fulfillment_sync_status := 'synced';
    v_order.fulfillment_synced_at := now();
    v_order.fulfillment_sync_error := null;
  end if;

  update public.orders
  set
    status = v_order.status,
    tracking_number = v_order.tracking_number,
    tracking_carrier = v_order.tracking_carrier,
    tracking_url = v_order.tracking_url,
    shipped_at = v_order.shipped_at,
    delivered_at = v_order.delivered_at,
    supplier_order_ref = v_order.supplier_order_ref,
    fulfillment_sync_status = v_order.fulfillment_sync_status,
    fulfillment_synced_at = v_order.fulfillment_synced_at,
    fulfillment_sync_error = v_order.fulfillment_sync_error
  where id = v_order.id
  returning * into v_order;

  insert into public.order_fulfillment_events (
    order_id,
    source,
    previous_status,
    new_status,
    tracking_number,
    tracking_carrier,
    tracking_url,
    supplier_order_ref,
    payload,
    note,
    created_by
  )
  values (
    v_order.id,
    v_source,
    v_prev,
    v_new,
    v_order.tracking_number,
    v_order.tracking_carrier,
    v_order.tracking_url,
    v_order.supplier_order_ref,
    coalesce(p_payload, '{}'::jsonb),
    nullif(trim(coalesce(p_note, '')), ''),
    case when v_is_service then null else v_actor end
  );

  return v_order;
end;
$$;

comment on function public.sync_order_fulfillment is
  'Updates order status/tracking from vendor UI or supplier auto-fulfillment workers.';

grant execute on function public.sync_order_fulfillment(
  uuid,
  public.order_status,
  text,
  text,
  text,
  text,
  public.fulfillment_sync_source,
  jsonb,
  text
) to authenticated, service_role;

create or replace function public.mark_order_fulfillment_sync(
  p_order_id uuid,
  p_status public.fulfillment_sync_status,
  p_error text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
begin
  if not (public.is_service_role() or public.is_admin()) then
    raise exception 'Only service role or admin can mark fulfillment sync state.';
  end if;

  update public.orders
  set
    fulfillment_sync_status = p_status,
    fulfillment_sync_error = case
      when p_status = 'error' then nullif(trim(coalesce(p_error, '')), '')
      else null
    end,
    fulfillment_synced_at = case
      when p_status = 'synced' then now()
      else fulfillment_synced_at
    end
  where id = p_order_id
  returning * into v_order;

  if not found then
    raise exception 'Order not found.';
  end if;

  return v_order;
end;
$$;

grant execute on function public.mark_order_fulfillment_sync(
  uuid,
  public.fulfillment_sync_status,
  text
) to authenticated, service_role;
