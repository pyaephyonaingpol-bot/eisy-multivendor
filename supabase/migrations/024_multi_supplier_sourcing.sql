-- =============================================================================
-- 024_multi_supplier_sourcing.sql
-- Expand sourcing to Spocket + Printify (Printful already seeded as POD).
-- Widen fulfillment job provider kinds beyond CJ/DSers.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Extend supplier_provider_kind with spocket
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'supplier_provider_kind'
      and e.enumlabel = 'spocket'
  ) then
    alter type public.supplier_provider_kind add value 'spocket';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Seed Spocket + Printify (Printful already exists from 013)
-- ---------------------------------------------------------------------------

insert into public.supplier_providers (
  slug, name, kind, default_origin_country, supports_regions, notes, is_active
)
values
  (
    'spocket',
    'Spocket',
    'spocket',
    'US',
    array['US', 'EU', 'SEA', 'GLOBAL', 'MM'],
    'US/EU dropship catalog with faster Western shipping lanes.',
    true
  ),
  (
    'printify',
    'Printify (POD)',
    'print_on_demand',
    'US',
    array['US', 'EU', 'GLOBAL'],
    'Print-on-demand network; fulfill apparel & merch via Printify.',
    true
  )
on conflict (slug) do update
set
  name = excluded.name,
  kind = excluded.kind,
  default_origin_country = excluded.default_origin_country,
  supports_regions = excluded.supports_regions,
  notes = excluded.notes,
  is_active = true,
  updated_at = now();

update public.supplier_providers
set
  notes = coalesce(
    notes,
    'Print-on-demand with US/EU production for apparel & merch.'
  ),
  is_active = true,
  updated_at = now()
where slug = 'printful';

-- ---------------------------------------------------------------------------
-- 3) Allow Spocket + POD in supplier fulfillment enqueue
-- ---------------------------------------------------------------------------

create or replace function public.enqueue_supplier_fulfillment_for_order(
  p_order_id uuid
)
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
  if p_order_id is null then
    raise exception 'order_id is required';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if v_order.payment_status is distinct from 'paid'
     and v_order.status not in ('paid', 'processing', 'shipped', 'delivered') then
    return jsonb_build_object(
      'order_id', p_order_id,
      'enqueued', 0,
      'skipped', 0,
      'message', 'Order is not paid yet'
    );
  end if;

  for v_provider in
    select distinct sp.*
    from public.order_items oi
    left join public.supplier_providers sp on sp.id = oi.supplier_provider_id
    where oi.order_id = p_order_id
      and sp.id is not null
      and sp.kind in (
        'cj_dropshipping',
        'dsers',
        'spocket',
        'print_on_demand'
      )
      and sp.is_active = true
    union
    select distinct sp.*
    from public.order_items oi
    join public.product_supplier_routes r
      on r.id = oi.supplier_route_id
      or (
        oi.supplier_route_id is null
        and r.product_id = coalesce(
          oi.source_product_id,
          oi.listing_product_id,
          oi.product_id
        )
        and r.is_active = true
      )
    join public.supplier_providers sp on sp.id = r.provider_id
    where oi.order_id = p_order_id
      and sp.kind in (
        'cj_dropshipping',
        'dsers',
        'spocket',
        'print_on_demand'
      )
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
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'order_id', p_order_id,
    'enqueued', v_enqueued,
    'skipped', v_skipped
  );
end;
$$;

comment on function public.enqueue_supplier_fulfillment_for_order(uuid) is
  'Queues external fulfillment jobs for CJ, DSers, Spocket, and POD providers.';
