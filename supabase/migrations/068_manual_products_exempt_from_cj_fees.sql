-- =============================================================================
-- 068_manual_products_exempt_from_cj_fees.sql
--
-- Completely separate Custom Sourcing / Manual products from CJ Dropshipping
-- fee constraints:
--   - Monthly inventory fees / fee floors apply ONLY to CJ import catalog
--   - Import quotas / subscription plan caps count ONLY CJ imports
--   - Min-active archive trigger applies ONLY to CJ catalog items
--   - Manual / custom-sourced products and orders are never billable
--
-- Canonical CJ signals: products.catalog_kind = 'cj_import'
--   OR row in public.cj_imported_products
-- =============================================================================

-- Ensure catalog_kind exists (idempotent if 060 already applied).
do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'product_catalog_kind'
  ) then
    create type public.product_catalog_kind as enum ('manual', 'cj_import');
  end if;
end;
$$;

alter table public.products
  add column if not exists catalog_kind public.product_catalog_kind;

update public.products
set catalog_kind = 'manual'
where catalog_kind is null;

alter table public.products
  alter column catalog_kind set default 'manual'::public.product_catalog_kind;

do $$
begin
  alter table public.products
    alter column catalog_kind set not null;
exception
  when others then null;
end;
$$;

-- Soft-create CJ registry so fee helpers can reference it on drifted DBs.
create table if not exists public.cj_imported_products (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  provider_id uuid,
  external_product_id text not null,
  external_variant_id text,
  external_sku text,
  supplier_cost_usdt numeric(12, 2) not null default 0.01,
  source_payload jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id),
  unique (vendor_id, external_product_id)
);

-- True when a product belongs to the CJ Dropshipping import workflow.
create or replace function public.product_is_cj_catalog(
  p_product_id uuid,
  p_vendor_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.products p
    where p.id = p_product_id
      and (p_vendor_id is null or p.vendor_id = p_vendor_id)
      and (
        p.catalog_kind = 'cj_import'::public.product_catalog_kind
        or exists (
          select 1
          from public.cj_imported_products c
          where c.product_id = p.id
            and (p_vendor_id is null or c.vendor_id = p_vendor_id)
        )
      )
  );
$$;

comment on function public.product_is_cj_catalog(uuid, uuid) is
  'CJ Dropshipping catalog only. Manual / custom-sourced products always return false.';

revoke all on function public.product_is_cj_catalog(uuid, uuid) from public;
grant execute on function public.product_is_cj_catalog(uuid, uuid)
  to authenticated, service_role;

-- Active CJ listings that generate the monthly inventory fee / fee floor.
create or replace function public.count_active_dropship_items(p_vendor_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(count(*)::integer, 0)
  from public.products p
  where p.vendor_id = p_vendor_id
    and p.status = 'active'
    and (
      p.catalog_kind = 'cj_import'::public.product_catalog_kind
      or exists (
        select 1
        from public.cj_imported_products c
        where c.product_id = p.id
          and c.vendor_id = p_vendor_id
      )
    );
$$;

comment on function public.count_active_dropship_items(uuid) is
  'Counts active CJ Dropshipping imports only. Manual/custom products are excluded.';

-- Vendor has any CJ import (active or not) → subject to CJ fee workflow.
create or replace function public.vendor_is_dropshipper(p_vendor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.products p
    where p.vendor_id = p_vendor_id
      and (
        p.catalog_kind = 'cj_import'::public.product_catalog_kind
        or exists (
          select 1
          from public.cj_imported_products c
          where c.product_id = p.id
            and c.vendor_id = p_vendor_id
        )
      )
  );
$$;

comment on function public.vendor_is_dropshipper(uuid) is
  'True when the vendor has CJ Dropshipping imports. Manual-only vendors are false.';

-- Import quota catalog size: CJ imports in active/draft only.
create or replace function public.count_imported_dropship_catalog_items(
  p_vendor_id uuid
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(count(*)::integer, 0)
  from public.products p
  where p.vendor_id = p_vendor_id
    and p.status in ('active', 'draft')
    and (
      p.catalog_kind = 'cj_import'::public.product_catalog_kind
      or exists (
        select 1
        from public.cj_imported_products c
        where c.product_id = p.id
          and c.vendor_id = p_vendor_id
      )
    );
$$;

comment on function public.count_imported_dropship_catalog_items(uuid) is
  'CJ import catalog size for plan caps. Manual/custom products never consume quota.';

-- Fee-floor archive guard: only for CJ catalog rows.
create or replace function public.enforce_dropship_min_active_items()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_min integer;
  v_was_counted boolean;
  v_will_count boolean;
  v_active_after integer;
  v_is_cj boolean;
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  -- Manual / custom-sourced products are never subject to the fee floor.
  v_is_cj := public.product_is_cj_catalog(new.id, new.vendor_id)
    or (
      new.catalog_kind is not distinct from 'cj_import'::public.product_catalog_kind
    );

  if not v_is_cj then
    return new;
  end if;

  select coalesce(min_billable_items, 10)
    into v_min
  from public.dropship_fee_settings
  where id = 1;

  v_was_counted :=
    old.status = 'active'
    and public.product_is_cj_catalog(old.id, old.vendor_id);

  v_will_count := new.status = 'active' and v_is_cj;

  -- Only block deactivation that would leave 1..min-1 active CJ items.
  -- Going to zero (exiting CJ dropshipping) is allowed.
  if v_was_counted and not v_will_count then
    v_active_after := public.count_active_dropship_items(new.vendor_id) - 1;

    if v_active_after > 0 and v_active_after < v_min then
      raise exception
        'CJ Dropshipping vendors must keep at least % active CJ imports (monthly fee floor). Manual/custom products are unaffected. Archive CJ listings only after reaching zero or staying at/above the minimum.',
        v_min;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists products_enforce_dropship_min_active_items
  on public.products;
create trigger products_enforce_dropship_min_active_items
  before update of status on public.products
  for each row
  execute function public.enforce_dropship_min_active_items();

-- Charge-all: only vendors with active CJ imports (manual/custom excluded).
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
    where p.status = 'active'
      and v.status = 'approved'
      and (
        p.catalog_kind = 'cj_import'::public.product_catalog_kind
        or exists (
          select 1
          from public.cj_imported_products c
          where c.product_id = p.id
            and c.vendor_id = v.id
        )
      )
    order by v.id
  loop
    begin
      v_result := public.charge_dropship_inventory_fee(
        v_vendor.id,
        v_month,
        v_run_id
      );
      if (v_result->>'status') = 'paid'
         and coalesce(v_result->>'message', '') not like 'Already paid%' then
        v_paid := v_paid + 1;
        v_total := v_total + coalesce((v_result->>'amount_usdt')::numeric, 0);
      elsif (v_result->>'status') = 'failed' then
        v_failed := v_failed + 1;
        v_errors := v_errors || jsonb_build_array(
          jsonb_build_object(
            'vendor_id', v_vendor.id,
            'error', coalesce(v_result->>'message', 'fee charge failed')
          )
        );
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
    'trigger_source', v_source,
    'scope', 'cj_import_only'
  );
end;
$$;

revoke all on function public.charge_all_dropship_inventory_fees(date, public.dropship_fee_charge_trigger, text) from public;
grant execute on function public.charge_all_dropship_inventory_fees(date, public.dropship_fee_charge_trigger, text)
  to authenticated, service_role;

-- Marketplace dropship copies of another vendor's product stay manual catalog
-- (not CJ) so they never enter the CJ fee floor / import quota.
create or replace function public.import_dropship_product(
  p_source_product_id uuid,
  p_price numeric,
  p_status public.product_status default 'active'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_vendor public.vendors%rowtype;
  v_source public.products%rowtype;
  v_source_vendor public.vendors%rowtype;
  v_existing public.products%rowtype;
  v_new public.products%rowtype;
  v_price numeric(12, 2);
  v_slug text;
  v_status public.product_status;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_source_product_id is null then
    raise exception 'Source product is required';
  end if;

  v_price := round(coalesce(p_price, 0)::numeric, 2);
  if v_price <= 0 then
    raise exception 'Import price must be greater than zero';
  end if;

  v_status := coalesce(p_status, 'active');
  if v_status not in ('draft', 'active', 'archived') then
    v_status := 'active';
  end if;

  select * into v_vendor
  from public.vendors
  where owner_id = v_user_id
  limit 1;

  if not found then
    raise exception 'Vendor profile required to import products';
  end if;

  if v_vendor.status is distinct from 'approved' then
    raise exception 'Only approved vendors can import dropship products';
  end if;

  select * into v_source
  from public.products
  where id = p_source_product_id
  for share;

  if not found then
    raise exception 'Source product not found';
  end if;

  if coalesce(v_source.is_dropship, false) and v_source.source_product_id is not null then
    select * into v_source
    from public.products
    where id = v_source.source_product_id
    for share;

    if not found then
      raise exception 'Source product not found';
    end if;
  end if;

  if v_source.status is distinct from 'active' then
    raise exception 'Only active catalog products can be imported';
  end if;

  select * into v_source_vendor
  from public.vendors
  where id = v_source.vendor_id;

  if not found or v_source_vendor.status is distinct from 'approved' then
    raise exception 'Source vendor is not available';
  end if;

  if v_source.vendor_id = v_vendor.id then
    raise exception 'Cannot import your own product';
  end if;

  -- Re-import of the same source updates price/status without a new quota slot.
  select * into v_existing
  from public.products
  where vendor_id = v_vendor.id
    and source_product_id = v_source.id
  limit 1;

  if found then
    update public.products
    set
      price = v_price,
      status = v_status,
      catalog_kind = 'manual'::public.product_catalog_kind,
      is_dropship = true,
      updated_at = now()
    where id = v_existing.id
    returning * into v_new;

    return jsonb_build_object(
      'product_id', v_new.id,
      'source_product_id', v_source.id,
      'updated', true,
      'price', v_new.price,
      'status', v_new.status,
      'slug', v_new.slug,
      'catalog_kind', 'manual'
    );
  end if;

  -- Marketplace copies are NOT CJ imports — do not consume CJ import quota / fee floor.
  -- (assert_vendor_can_import_product only counts CJ catalog after this migration.)

  v_slug := trim(both '-' from lower(regexp_replace(
    coalesce(nullif(trim(v_source.name), ''), 'product') || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
    '[^a-z0-9]+',
    '-',
    'g'
  )));

  insert into public.products (
    vendor_id,
    category_id,
    name,
    slug,
    description,
    price,
    compare_at_price,
    currency,
    sku,
    stock,
    images,
    specifications,
    status,
    product_type,
    download_url,
    download_label,
    source_product_id,
    is_dropship,
    catalog_kind
  )
  values (
    v_vendor.id,
    v_source.category_id,
    v_source.name,
    v_slug,
    v_source.description,
    v_price,
    v_source.compare_at_price,
    'USDT',
    v_source.sku,
    0,
    coalesce(v_source.images, '[]'::jsonb),
    coalesce(v_source.specifications, '[]'::jsonb),
    v_status,
    coalesce(v_source.product_type, 'physical'),
    v_source.download_url,
    v_source.download_label,
    v_source.id,
    true,
    'manual'::public.product_catalog_kind
  )
  returning * into v_new;

  return jsonb_build_object(
    'product_id', v_new.id,
    'source_product_id', v_source.id,
    'updated', false,
    'price', v_new.price,
    'status', v_new.status,
    'slug', v_new.slug,
    'catalog_kind', 'manual'
  );
end;
$$;

revoke all on function public.import_dropship_product(uuid, numeric, public.product_status) from public;
grant execute on function public.import_dropship_product(uuid, numeric, public.product_status)
  to authenticated;

comment on column public.dropship_fee_settings.min_billable_items is
  'Strict minimum active CJ import items for CJ dropshippers (monthly fee floor: item_fee × min). Manual/custom products are exempt.';

comment on table public.dropship_inventory_fee_invoices is
  'Monthly CJ Dropshipping inventory fees only. Manual/custom catalogs are never invoiced.';

notify pgrst, 'reload schema';
