-- Dropshipper product import limits & tier controls
-- 1) Min active items stays aligned with fee floor (default 10 → 1 USDT × 10)
-- 2) Max import caps: system default, per subscription plan, or vendor override
-- 3) External CJ/DSers imports count toward fees and import quotas

-- ---------------------------------------------------------------------------
-- Settings: system-wide default max imports (singleton on fee settings)
-- ---------------------------------------------------------------------------

alter table public.dropship_fee_settings
  add column if not exists default_max_import_items integer;

update public.dropship_fee_settings
set default_max_import_items = coalesce(default_max_import_items, 100)
where id = 1;

alter table public.dropship_fee_settings
  alter column default_max_import_items set default 100;

alter table public.dropship_fee_settings
  alter column default_max_import_items set not null;

do $$
begin
  alter table public.dropship_fee_settings
    add constraint dropship_fee_settings_default_max_import_items_chk
    check (
      default_max_import_items >= min_billable_items
      and default_max_import_items >= 1
    );
exception
  when duplicate_object then null;
end $$;

comment on column public.dropship_fee_settings.default_max_import_items is
  'System-wide max imported dropship catalog items when no plan/vendor override applies.';

comment on column public.dropship_fee_settings.min_billable_items is
  'Strict minimum active items for dropshippers (also monthly fee floor: item_fee × min).';

-- ---------------------------------------------------------------------------
-- Per subscription-plan import caps
-- ---------------------------------------------------------------------------

create table if not exists public.dropship_plan_import_limits (
  plan public.subscription_plan primary key,
  max_import_items integer not null check (max_import_items >= 1),
  updated_at timestamptz not null default now()
);

insert into public.dropship_plan_import_limits (plan, max_import_items)
values
  ('free', 50),
  ('starter', 100),
  ('pro', 250),
  ('enterprise', 1000)
on conflict (plan) do nothing;

comment on table public.dropship_plan_import_limits is
  'Maximum imported dropship catalog size by subscription plan.';

alter table public.dropship_plan_import_limits enable row level security;

drop policy if exists "dropship_plan_import_limits_select_authenticated"
  on public.dropship_plan_import_limits;
create policy "dropship_plan_import_limits_select_authenticated"
  on public.dropship_plan_import_limits for select
  to authenticated
  using (true);

drop policy if exists "dropship_plan_import_limits_admin_write"
  on public.dropship_plan_import_limits;
create policy "dropship_plan_import_limits_admin_write"
  on public.dropship_plan_import_limits for all
  using (public.is_admin())
  with check (public.is_admin());

drop trigger if exists dropship_plan_import_limits_set_updated_at
  on public.dropship_plan_import_limits;
create trigger dropship_plan_import_limits_set_updated_at
  before update on public.dropship_plan_import_limits
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Optional per-vendor override
-- ---------------------------------------------------------------------------

alter table public.vendors
  add column if not exists max_import_items_override integer;

do $$
begin
  alter table public.vendors
    add constraint vendors_max_import_items_override_chk
    check (
      max_import_items_override is null
      or max_import_items_override >= 1
    );
exception
  when duplicate_object then null;
end $$;

comment on column public.vendors.max_import_items_override is
  'When set, overrides plan/system max import limit for this vendor.';

-- ---------------------------------------------------------------------------
-- Counting helpers (internal dropship + CJ/DSers external imports)
-- ---------------------------------------------------------------------------

create or replace function public.product_is_external_import(
  p_product_id uuid,
  p_vendor_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.external_product_imports e
    where e.product_id = p_product_id
      and e.vendor_id = p_vendor_id
  );
$$;

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
      coalesce(p.is_dropship, false) = true
      or exists (
        select 1
        from public.external_product_imports e
        where e.product_id = p.id
          and e.vendor_id = p_vendor_id
      )
    );
$$;

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
        coalesce(p.is_dropship, false) = true
        or exists (
          select 1
          from public.external_product_imports e
          where e.product_id = p.id
            and e.vendor_id = p_vendor_id
        )
      )
  );
$$;

-- Catalog size for max caps: active + draft (archived does not consume quota)
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
      coalesce(p.is_dropship, false) = true
      or exists (
        select 1
        from public.external_product_imports e
        where e.product_id = p.id
          and e.vendor_id = p_vendor_id
      )
    );
$$;

create or replace function public.resolve_vendor_subscription_plan(
  p_vendor_id uuid
)
returns public.subscription_plan
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_plan public.subscription_plan;
begin
  select s.plan
    into v_plan
  from public.subscriptions s
  where s.vendor_id = p_vendor_id
    and s.status = 'active'
  order by s.updated_at desc
  limit 1;

  return coalesce(v_plan, 'free'::public.subscription_plan);
end;
$$;

create or replace function public.resolve_vendor_max_import_items(
  p_vendor_id uuid
)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_override integer;
  v_plan public.subscription_plan;
  v_plan_max integer;
  v_default_max integer;
  v_min_items integer;
begin
  select max_import_items_override
    into v_override
  from public.vendors
  where id = p_vendor_id;

  if v_override is not null then
    return v_override;
  end if;

  v_plan := public.resolve_vendor_subscription_plan(p_vendor_id);

  select max_import_items
    into v_plan_max
  from public.dropship_plan_import_limits
  where plan = v_plan;

  select default_max_import_items, min_billable_items
    into v_default_max, v_min_items
  from public.dropship_fee_settings
  where id = 1;

  return greatest(
    coalesce(v_plan_max, v_default_max, 100),
    coalesce(v_min_items, 10)
  );
end;
$$;

create or replace function public.get_vendor_import_quota(p_vendor_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_settings public.dropship_fee_settings%rowtype;
  v_plan public.subscription_plan;
  v_active integer;
  v_catalog integer;
  v_max integer;
  v_override integer;
begin
  if p_vendor_id is null then
    raise exception 'Vendor id is required';
  end if;

  if not (
    public.is_admin()
    or public.owns_vendor(p_vendor_id)
  ) then
    raise exception 'Not allowed to view import quota for this vendor';
  end if;

  select * into v_settings
  from public.dropship_fee_settings
  where id = 1;

  select max_import_items_override
    into v_override
  from public.vendors
  where id = p_vendor_id;

  v_plan := public.resolve_vendor_subscription_plan(p_vendor_id);
  v_active := public.count_active_dropship_items(p_vendor_id);
  v_catalog := public.count_imported_dropship_catalog_items(p_vendor_id);
  v_max := public.resolve_vendor_max_import_items(p_vendor_id);

  return jsonb_build_object(
    'vendor_id', p_vendor_id,
    'plan', v_plan,
    'active_item_count', v_active,
    'catalog_item_count', v_catalog,
    'min_active_items', coalesce(v_settings.min_billable_items, 10),
    'max_import_items', v_max,
    'remaining_import_slots', greatest(v_max - v_catalog, 0),
    'meets_minimum',
      v_active = 0 or v_active >= coalesce(v_settings.min_billable_items, 10),
    'at_import_limit', v_catalog >= v_max,
    'item_fee_usdt', coalesce(v_settings.item_fee_usdt, 1),
    'limit_source', case
      when v_override is not null then 'vendor_override'
      when exists (
        select 1
        from public.dropship_plan_import_limits pl
        where pl.plan = v_plan
      ) then 'subscription_plan'
      else 'system_default'
    end,
    'default_max_import_items', coalesce(v_settings.default_max_import_items, 100)
  );
end;
$$;

revoke all on function public.get_vendor_import_quota(uuid) from public;
grant execute on function public.get_vendor_import_quota(uuid) to authenticated;

create or replace function public.assert_vendor_can_import_product(
  p_vendor_id uuid,
  p_is_new_catalog_item boolean default true
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_catalog integer;
  v_max integer;
begin
  if not coalesce(p_is_new_catalog_item, true) then
    return;
  end if;

  v_catalog := public.count_imported_dropship_catalog_items(p_vendor_id);
  v_max := public.resolve_vendor_max_import_items(p_vendor_id);

  if v_catalog >= v_max then
    raise exception
      'Import limit reached (% / % items). Upgrade your plan or archive unused listings.',
      v_catalog,
      v_max;
  end if;
end;
$$;

revoke all on function public.assert_vendor_can_import_product(uuid, boolean) from public;
grant execute on function public.assert_vendor_can_import_product(uuid, boolean)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Enforce max on marketplace dropship import RPC (based on 019)
-- ---------------------------------------------------------------------------

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

  -- Always import the original supplier SKU (unwrap nested dropship copies).
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

  if v_source.vendor_id = v_vendor.id then
    raise exception 'You already sell this product';
  end if;

  -- Prevent selling below supplier cost (platform would mint ledger credit).
  if v_price < v_source.price then
    raise exception
      'Listing price % USDT cannot be below supplier price % USDT',
      v_price,
      v_source.price;
  end if;

  select * into v_source_vendor
  from public.vendors
  where id = v_source.vendor_id;

  if not found or v_source_vendor.status is distinct from 'approved' then
    raise exception 'Supplier is not an approved vendor';
  end if;

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
      updated_at = now()
    where id = v_existing.id
    returning * into v_new;

    return jsonb_build_object(
      'product_id', v_new.id,
      'source_product_id', v_source.id,
      'updated', true,
      'price', v_new.price,
      'status', v_new.status,
      'slug', v_new.slug
    );
  end if;

  perform public.assert_vendor_can_import_product(v_vendor.id, true);

  v_slug := left(
    regexp_replace(
      lower(trim(v_source.slug || '-ds-' || substr(replace(v_vendor.id::text, '-', ''), 1, 8))),
      '[^a-z0-9]+',
      '-',
      'g'
    ),
    80
  );
  v_slug := trim(both '-' from v_slug);

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
    stock_quantity,
    images,
    specifications,
    status,
    product_type,
    download_url,
    download_label,
    source_product_id,
    is_dropship
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
    true
  )
  returning * into v_new;

  return jsonb_build_object(
    'product_id', v_new.id,
    'source_product_id', v_source.id,
    'updated', false,
    'price', v_new.price,
    'status', v_new.status,
    'slug', v_new.slug
  );
end;
$$;

revoke all on function public.import_dropship_product(uuid, numeric, public.product_status) from public;
grant execute on function public.import_dropship_product(uuid, numeric, public.product_status)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Enforce min active items (fee floor) when deactivating catalog products
-- ---------------------------------------------------------------------------

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
  v_is_catalog boolean;
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  select coalesce(min_billable_items, 10)
    into v_min
  from public.dropship_fee_settings
  where id = 1;

  v_is_catalog :=
    coalesce(new.is_dropship, false) = true
    or public.product_is_external_import(new.id, new.vendor_id);

  if not v_is_catalog then
    return new;
  end if;

  v_was_counted :=
    old.status = 'active'
    and (
      coalesce(old.is_dropship, false) = true
      or public.product_is_external_import(old.id, old.vendor_id)
    );

  v_will_count := new.status = 'active' and v_is_catalog;

  -- Only block deactivation that would leave 1..min-1 active items.
  -- Going to zero (exiting dropshipping) is allowed.
  if v_was_counted and not v_will_count then
    v_active_after := public.count_active_dropship_items(new.vendor_id) - 1;

    if v_active_after > 0 and v_active_after < v_min then
      raise exception
        'Dropshippers must keep at least % active items (1 USDT each monthly fee floor). Archive extra listings only after reaching zero or staying at/above the minimum.',
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

-- ---------------------------------------------------------------------------
-- Admin helper to update system/plan limits
-- ---------------------------------------------------------------------------

create or replace function public.admin_update_import_limit_settings(
  p_default_max_import_items integer default null,
  p_min_billable_items integer default null,
  p_plan_limits jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_max integer;
  v_settings public.dropship_fee_settings%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only admins can update import limit settings';
  end if;

  update public.dropship_fee_settings
  set
    default_max_import_items = coalesce(
      p_default_max_import_items,
      default_max_import_items
    ),
    min_billable_items = coalesce(p_min_billable_items, min_billable_items),
    updated_at = now()
  where id = 1
  returning * into v_settings;

  if p_plan_limits is not null then
    for v_plan, v_max in
      select key, value::integer
      from jsonb_each_text(p_plan_limits)
    loop
      if v_plan not in ('free', 'starter', 'pro', 'enterprise') then
        raise exception 'Unknown plan %', v_plan;
      end if;
      if v_max is null or v_max < coalesce(v_settings.min_billable_items, 10) then
        raise exception
          'Plan % max must be at least the minimum active items (%)',
          v_plan,
          coalesce(v_settings.min_billable_items, 10);
      end if;

      insert into public.dropship_plan_import_limits (plan, max_import_items)
      values (v_plan::public.subscription_plan, v_max)
      on conflict (plan) do update
        set max_import_items = excluded.max_import_items,
            updated_at = now();
    end loop;
  end if;

  return jsonb_build_object(
    'default_max_import_items', v_settings.default_max_import_items,
    'min_billable_items', v_settings.min_billable_items,
    'item_fee_usdt', v_settings.item_fee_usdt,
    'plan_limits', (
      select coalesce(jsonb_object_agg(plan::text, max_import_items), '{}'::jsonb)
      from public.dropship_plan_import_limits
    )
  );
end;
$$;

revoke all on function public.admin_update_import_limit_settings(integer, integer, jsonb) from public;
grant execute on function public.admin_update_import_limit_settings(integer, integer, jsonb)
  to authenticated;
