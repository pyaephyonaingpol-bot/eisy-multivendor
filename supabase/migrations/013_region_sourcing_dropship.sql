-- Region-based sourcing: match buyer country/region to dropship providers
-- (CJ Dropshipping, DSers, Print-on-Demand, internal) for faster/cheaper shipping.
-- USDT checkout settlement and MMK/USDT wallet withdrawal rules are unchanged.

-- ---------------------------------------------------------------------------
-- sourcing_regions — buyer destination buckets
-- ---------------------------------------------------------------------------

create table if not exists public.sourcing_regions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  country_codes text[] not null default '{}'::text[],
  is_default boolean not null default false,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sourcing_regions_is_active_idx
  on public.sourcing_regions (is_active);

comment on table public.sourcing_regions is
  'Buyer destination regions used to route dropship catalogs to nearby warehouses.';

drop trigger if exists sourcing_regions_set_updated_at on public.sourcing_regions;
create trigger sourcing_regions_set_updated_at
  before update on public.sourcing_regions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- supplier_providers — CJ / DSers / POD / internal adapters
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'supplier_provider_kind'
  ) then
    create type public.supplier_provider_kind as enum (
      'internal',
      'cj_dropshipping',
      'dsers',
      'print_on_demand',
      'other'
    );
  end if;
end;
$$;

create table if not exists public.supplier_providers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  kind public.supplier_provider_kind not null default 'other',
  default_origin_country text not null default 'CN',
  supports_regions text[] not null default '{}'::text[],
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists supplier_providers_is_active_idx
  on public.supplier_providers (is_active);

create index if not exists supplier_providers_kind_idx
  on public.supplier_providers (kind);

comment on table public.supplier_providers is
  'External/internal dropship catalog providers (CJ, DSers, POD, marketplace vendors).';

drop trigger if exists supplier_providers_set_updated_at on public.supplier_providers;
create trigger supplier_providers_set_updated_at
  before update on public.supplier_providers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- product_supplier_routes — per-product, per-region supplier choice
-- ---------------------------------------------------------------------------

create table if not exists public.product_supplier_routes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  region_id uuid not null references public.sourcing_regions (id) on delete cascade,
  provider_id uuid not null references public.supplier_providers (id) on delete restrict,
  external_sku text,
  warehouse_country text not null,
  shipping_days_min integer check (shipping_days_min is null or shipping_days_min >= 0),
  shipping_days_max integer check (
    shipping_days_max is null
    or shipping_days_min is null
    or shipping_days_max >= shipping_days_min
  ),
  shipping_cost_usdt numeric(12, 2) not null default 0 check (shipping_cost_usdt >= 0),
  priority integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, region_id, provider_id)
);

create index if not exists product_supplier_routes_product_id_idx
  on public.product_supplier_routes (product_id);

create index if not exists product_supplier_routes_region_id_idx
  on public.product_supplier_routes (region_id);

create index if not exists product_supplier_routes_active_priority_idx
  on public.product_supplier_routes (product_id, region_id, is_active, priority);

comment on table public.product_supplier_routes is
  'Maps a catalog/source product + buyer region to a preferred dropship provider/warehouse.';

drop trigger if exists product_supplier_routes_set_updated_at on public.product_supplier_routes;
create trigger product_supplier_routes_set_updated_at
  before update on public.product_supplier_routes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Buyer region preference + order sourcing metadata
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists preferred_region_id uuid references public.sourcing_regions (id) on delete set null,
  add column if not exists preferred_country_code text;

comment on column public.profiles.preferred_region_id is
  'Last selected buyer sourcing region for catalog shipping estimates.';
comment on column public.profiles.preferred_country_code is
  'ISO-ish country code used for region detection (e.g. MM, TH, US).';

alter table public.orders
  add column if not exists buyer_region_id uuid references public.sourcing_regions (id) on delete set null,
  add column if not exists buyer_country_code text;

comment on column public.orders.buyer_region_id is
  'Resolved sourcing region at checkout from shipping country.';
comment on column public.orders.buyer_country_code is
  'Buyer shipping country used for supplier routing.';

alter table public.order_items
  add column if not exists supplier_provider_id uuid references public.supplier_providers (id) on delete set null,
  add column if not exists supplier_route_id uuid references public.product_supplier_routes (id) on delete set null,
  add column if not exists warehouse_country text,
  add column if not exists shipping_estimate_days_min integer,
  add column if not exists shipping_estimate_days_max integer,
  add column if not exists shipping_cost_usdt numeric(12, 2);

comment on column public.order_items.supplier_provider_id is
  'Dropship provider selected for this line (CJ/DSers/POD/internal).';
comment on column public.order_items.supplier_route_id is
  'Matched product_supplier_routes row used at checkout.';

-- ---------------------------------------------------------------------------
-- Seed regions + providers
-- ---------------------------------------------------------------------------

insert into public.sourcing_regions (code, name, country_codes, is_default, sort_order)
values
  ('MM', 'Myanmar', array['MM'], true, 10),
  ('SEA', 'Southeast Asia', array['TH','SG','MY','ID','VN','KH','LA','PH','BN'], false, 20),
  ('CN', 'China / East Asia', array['CN','HK','TW','KR','JP'], false, 30),
  ('EU', 'Europe', array['DE','FR','IT','ES','NL','BE','PL','SE','AT','IE','PT'], false, 40),
  ('US', 'North America', array['US','CA','MX'], false, 50),
  ('GLOBAL', 'Rest of world', array[]::text[], false, 100)
on conflict (code) do update
set
  name = excluded.name,
  country_codes = excluded.country_codes,
  is_default = excluded.is_default,
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();

-- Exactly one default region.
update public.sourcing_regions
set is_default = (code = 'MM');

insert into public.supplier_providers (
  slug, name, kind, default_origin_country, supports_regions, notes
)
values
  (
    'internal',
    'EISY Internal Vendors',
    'internal',
    'MM',
    array['MM','SEA','GLOBAL'],
    'Marketplace vendor inventory fulfilled inside EISY.'
  ),
  (
    'cj-dropshipping',
    'CJ Dropshipping',
    'cj_dropshipping',
    'CN',
    array['CN','SEA','US','EU','GLOBAL','MM'],
    'China + regional warehouses; good for SEA/US/EU when local stock exists.'
  ),
  (
    'dsers',
    'DSers / AliExpress',
    'dsers',
    'CN',
    array['CN','SEA','EU','US','GLOBAL'],
    'AliExpress/DSers catalog routing for broad international coverage.'
  ),
  (
    'printful',
    'Printful (POD)',
    'print_on_demand',
    'US',
    array['US','EU','GLOBAL'],
    'Print-on-demand with US/EU production for apparel & merch.'
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

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.sourcing_regions enable row level security;
alter table public.supplier_providers enable row level security;
alter table public.product_supplier_routes enable row level security;

drop policy if exists "sourcing_regions_select_active_or_admin" on public.sourcing_regions;
create policy "sourcing_regions_select_active_or_admin"
  on public.sourcing_regions for select
  using (is_active = true or public.is_admin());

drop policy if exists "sourcing_regions_admin_write" on public.sourcing_regions;
create policy "sourcing_regions_admin_write"
  on public.sourcing_regions for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "supplier_providers_select_active_or_admin" on public.supplier_providers;
create policy "supplier_providers_select_active_or_admin"
  on public.supplier_providers for select
  using (is_active = true or public.is_admin());

drop policy if exists "supplier_providers_admin_write" on public.supplier_providers;
create policy "supplier_providers_admin_write"
  on public.supplier_providers for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "product_supplier_routes_select_public_or_owner" on public.product_supplier_routes;
create policy "product_supplier_routes_select_public_or_owner"
  on public.product_supplier_routes for select
  using (
    is_active = true
    or public.is_admin()
    or exists (
      select 1
      from public.products p
      where p.id = product_supplier_routes.product_id
        and public.owns_vendor(p.vendor_id)
    )
  );

drop policy if exists "product_supplier_routes_insert_owner" on public.product_supplier_routes;
create policy "product_supplier_routes_insert_owner"
  on public.product_supplier_routes for insert
  with check (
    public.is_admin()
    or exists (
      select 1
      from public.products p
      where p.id = product_id
        and public.owns_vendor(p.vendor_id)
    )
  );

drop policy if exists "product_supplier_routes_update_owner" on public.product_supplier_routes;
create policy "product_supplier_routes_update_owner"
  on public.product_supplier_routes for update
  using (
    public.is_admin()
    or exists (
      select 1
      from public.products p
      where p.id = product_supplier_routes.product_id
        and public.owns_vendor(p.vendor_id)
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1
      from public.products p
      where p.id = product_id
        and public.owns_vendor(p.vendor_id)
    )
  );

drop policy if exists "product_supplier_routes_delete_owner" on public.product_supplier_routes;
create policy "product_supplier_routes_delete_owner"
  on public.product_supplier_routes for delete
  using (
    public.is_admin()
    or exists (
      select 1
      from public.products p
      where p.id = product_supplier_routes.product_id
        and public.owns_vendor(p.vendor_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Helpers: resolve region + best supplier route
-- ---------------------------------------------------------------------------

create or replace function public.resolve_sourcing_region(p_country_code text)
returns public.sourcing_regions
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_code text := upper(nullif(trim(coalesce(p_country_code, '')), ''));
  v_region public.sourcing_regions%rowtype;
begin
  if v_code is not null then
    select * into v_region
    from public.sourcing_regions
    where is_active = true
      and v_code = any (country_codes)
    order by sort_order
    limit 1;

    if found then
      return v_region;
    end if;
  end if;

  select * into v_region
  from public.sourcing_regions
  where is_active = true and is_default = true
  order by sort_order
  limit 1;

  if found then
    return v_region;
  end if;

  select * into v_region
  from public.sourcing_regions
  where is_active = true
  order by sort_order
  limit 1;

  return v_region;
end;
$$;

grant execute on function public.resolve_sourcing_region(text) to anon, authenticated;

create or replace function public.resolve_product_supplier_route(
  p_product_id uuid,
  p_country_code text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_product public.products%rowtype;
  v_source_id uuid;
  v_region public.sourcing_regions%rowtype;
  v_route public.product_supplier_routes%rowtype;
  v_provider public.supplier_providers%rowtype;
begin
  if p_product_id is null then
    return null;
  end if;

  select * into v_product
  from public.products
  where id = p_product_id;

  if not found then
    return null;
  end if;

  -- Always route against the supplier/source SKU for dropship listings.
  v_source_id := case
    when coalesce(v_product.is_dropship, false) and v_product.source_product_id is not null
      then v_product.source_product_id
    else v_product.id
  end;

  v_region := public.resolve_sourcing_region(p_country_code);
  if v_region.id is null then
    return null;
  end if;

  select r.* into v_route
  from public.product_supplier_routes r
  join public.supplier_providers sp on sp.id = r.provider_id
  where r.product_id = v_source_id
    and r.region_id = v_region.id
    and r.is_active = true
    and sp.is_active = true
  order by r.priority asc, r.shipping_cost_usdt asc, r.created_at asc
  limit 1;

  -- Fallback: any active route on the source product (global coverage).
  if not found then
    select r.* into v_route
    from public.product_supplier_routes r
    join public.supplier_providers sp on sp.id = r.provider_id
    where r.product_id = v_source_id
      and r.is_active = true
      and sp.is_active = true
    order by r.priority asc, r.shipping_cost_usdt asc
    limit 1;
  end if;

  -- Fallback: internal provider template for marketplace vendor fulfillment.
  if not found then
    select * into v_provider
    from public.supplier_providers
    where slug = 'internal' and is_active = true
    limit 1;

    return jsonb_build_object(
      'product_id', v_product.id,
      'source_product_id', v_source_id,
      'region_id', v_region.id,
      'region_code', v_region.code,
      'region_name', v_region.name,
      'provider_id', v_provider.id,
      'provider_slug', coalesce(v_provider.slug, 'internal'),
      'provider_name', coalesce(v_provider.name, 'EISY Internal Vendors'),
      'provider_kind', coalesce(v_provider.kind::text, 'internal'),
      'route_id', null,
      'warehouse_country', coalesce(v_provider.default_origin_country, 'MM'),
      'shipping_days_min', 3,
      'shipping_days_max', 10,
      'shipping_cost_usdt', 0,
      'external_sku', null
    );
  end if;

  select * into v_provider
  from public.supplier_providers
  where id = v_route.provider_id;

  return jsonb_build_object(
    'product_id', v_product.id,
    'source_product_id', v_source_id,
    'region_id', v_region.id,
    'region_code', v_region.code,
    'region_name', v_region.name,
    'provider_id', v_provider.id,
    'provider_slug', v_provider.slug,
    'provider_name', v_provider.name,
    'provider_kind', v_provider.kind::text,
    'route_id', v_route.id,
    'warehouse_country', v_route.warehouse_country,
    'shipping_days_min', v_route.shipping_days_min,
    'shipping_days_max', v_route.shipping_days_max,
    'shipping_cost_usdt', v_route.shipping_cost_usdt,
    'external_sku', v_route.external_sku
  );
end;
$$;

grant execute on function public.resolve_product_supplier_route(uuid, text) to anon, authenticated;

create or replace function public.set_preferred_sourcing_region(
  p_country_code text,
  p_region_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_region public.sourcing_regions%rowtype;
  v_country text := upper(nullif(trim(coalesce(p_country_code, '')), ''));
begin
  if p_region_code is not null and trim(p_region_code) <> '' then
    select * into v_region
    from public.sourcing_regions
    where code = upper(trim(p_region_code))
      and is_active = true
    limit 1;
  end if;

  if v_region.id is null then
    v_region := public.resolve_sourcing_region(v_country);
  end if;

  if v_region.id is null then
    raise exception 'No sourcing region available';
  end if;

  if v_country is null and array_length(v_region.country_codes, 1) >= 1 then
    v_country := v_region.country_codes[1];
  end if;

  if v_user_id is not null then
    update public.profiles
    set
      preferred_region_id = v_region.id,
      preferred_country_code = v_country,
      updated_at = now()
    where id = v_user_id;
  end if;

  return jsonb_build_object(
    'region_id', v_region.id,
    'region_code', v_region.code,
    'region_name', v_region.name,
    'country_code', v_country,
    'country_codes', to_jsonb(v_region.country_codes)
  );
end;
$$;

grant execute on function public.set_preferred_sourcing_region(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- checkout_with_usdt — keep wallet rules; attach regional supplier metadata
-- ---------------------------------------------------------------------------

create or replace function public.checkout_with_usdt(
  p_items jsonb,
  p_shipping_address jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_item jsonb;
  v_product_id uuid;
  v_qty integer;
  v_listing public.products%rowtype;
  v_fulfill public.products%rowtype;
  v_seller public.vendors%rowtype;
  v_supplier public.vendors%rowtype;
  v_buyer_wallet public.wallets%rowtype;
  v_wallet public.wallets%rowtype;
  v_grand_total numeric(18, 6) := 0;
  v_shipping jsonb := coalesce(p_shipping_address, '{}'::jsonb);
  v_order_ids uuid[] := '{}';
  v_order_id uuid;
  v_tx_id uuid;
  v_group record;
  v_supplier_subtotal numeric(18, 6);
  v_seller_margin numeric(18, 6);
  v_listing_subtotal numeric(18, 6);
  v_country text := upper(nullif(trim(coalesce(p_shipping_address->>'country', '')), ''));
  v_region public.sourcing_regions%rowtype;
  v_route jsonb;
  v_shipping_total numeric(18, 6) := 0;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Cart is empty';
  end if;

  if v_country is null then
    v_country := 'MM';
  end if;

  v_region := public.resolve_sourcing_region(v_country);

  create temporary table tmp_checkout_lines (
    listing_product_id uuid not null,
    source_product_id uuid not null,
    fulfillment_vendor_id uuid not null,
    seller_vendor_id uuid not null,
    supplier_owner_id uuid not null,
    seller_owner_id uuid not null,
    product_name text not null,
    quantity integer not null,
    unit_price numeric(18, 6) not null,
    cost_unit_price numeric(18, 6) not null,
    line_total numeric(18, 6) not null,
    cost_line_total numeric(18, 6) not null,
    margin_line_total numeric(18, 6) not null,
    product_type text not null,
    supplier_provider_id uuid,
    supplier_route_id uuid,
    warehouse_country text,
    shipping_days_min integer,
    shipping_days_max integer,
    shipping_cost_usdt numeric(18, 6) not null default 0
  ) on commit drop;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    begin
      v_product_id := (v_item->>'product_id')::uuid;
    exception when others then
      raise exception 'Invalid product_id in cart';
    end;

    begin
      v_qty := greatest(1, floor(coalesce((v_item->>'quantity')::numeric, 0))::integer);
    exception when others then
      raise exception 'Invalid quantity for product %', v_product_id;
    end;

    if v_qty < 1 then
      raise exception 'Invalid quantity for product %', v_product_id;
    end if;

    select * into v_listing
    from public.products
    where id = v_product_id
    for update;

    if not found or v_listing.status is distinct from 'active' then
      raise exception 'Product % is not available', v_product_id;
    end if;

    select * into v_seller
    from public.vendors
    where id = v_listing.vendor_id;

    if not found or v_seller.status is distinct from 'approved' then
      raise exception 'Vendor for % is not approved', v_listing.name;
    end if;

    if coalesce(v_listing.is_dropship, false) and v_listing.source_product_id is not null then
      select * into v_fulfill
      from public.products
      where id = v_listing.source_product_id
      for update;

      if not found or v_fulfill.status is distinct from 'active' then
        raise exception 'Supplier stock for % is unavailable', v_listing.name;
      end if;
    else
      v_fulfill := v_listing;
    end if;

    select * into v_supplier
    from public.vendors
    where id = v_fulfill.vendor_id;

    if not found or v_supplier.status is distinct from 'approved' then
      raise exception 'Supplier for % is not approved', v_listing.name;
    end if;

    if coalesce(v_fulfill.product_type, 'physical') = 'physical'
       and v_fulfill.stock_quantity < v_qty then
      raise exception 'Insufficient stock for %', v_listing.name;
    end if;

    v_route := public.resolve_product_supplier_route(v_listing.id, v_country);

    insert into tmp_checkout_lines (
      listing_product_id,
      source_product_id,
      fulfillment_vendor_id,
      seller_vendor_id,
      supplier_owner_id,
      seller_owner_id,
      product_name,
      quantity,
      unit_price,
      cost_unit_price,
      line_total,
      cost_line_total,
      margin_line_total,
      product_type,
      supplier_provider_id,
      supplier_route_id,
      warehouse_country,
      shipping_days_min,
      shipping_days_max,
      shipping_cost_usdt
    )
    values (
      v_listing.id,
      v_fulfill.id,
      v_fulfill.vendor_id,
      v_listing.vendor_id,
      v_supplier.owner_id,
      v_seller.owner_id,
      v_listing.name,
      v_qty,
      v_listing.price,
      v_fulfill.price,
      round(v_listing.price * v_qty, 6),
      round(v_fulfill.price * v_qty, 6),
      round((v_listing.price - v_fulfill.price) * v_qty, 6),
      coalesce(v_fulfill.product_type, 'physical'),
      nullif(v_route->>'provider_id', '')::uuid,
      nullif(v_route->>'route_id', '')::uuid,
      coalesce(v_route->>'warehouse_country', 'MM'),
      nullif(v_route->>'shipping_days_min', '')::integer,
      nullif(v_route->>'shipping_days_max', '')::integer,
      coalesce((v_route->>'shipping_cost_usdt')::numeric, 0) * v_qty
    );
  end loop;

  select
    coalesce(sum(line_total), 0),
    coalesce(sum(shipping_cost_usdt), 0)
  into v_grand_total, v_shipping_total
  from tmp_checkout_lines;

  v_grand_total := v_grand_total + v_shipping_total;

  if v_grand_total <= 0 then
    raise exception 'Order total must be greater than zero';
  end if;

  perform public.ensure_user_wallets(v_user_id);

  select * into v_buyer_wallet
  from public.wallets
  where user_id = v_user_id and currency = 'USDT'
  for update;

  if not found then
    raise exception 'USDT wallet not found';
  end if;

  if v_buyer_wallet.available_balance < v_grand_total then
    raise exception 'Insufficient USDT balance. Deposit funds or reduce your cart.';
  end if;

  update public.wallets
  set available_balance = available_balance - v_grand_total
  where id = v_buyer_wallet.id;

  insert into public.wallet_transactions (
    wallet_id, user_id, currency, tx_type, status, amount, reference, note
  )
  values (
    v_buyer_wallet.id,
    v_user_id,
    'USDT',
    'purchase',
    'completed',
    v_grand_total,
    'checkout',
    'USDT checkout payment'
  )
  returning id into v_tx_id;

  -- Remember buyer region preference (does not affect wallet rules).
  update public.profiles
  set
    preferred_region_id = v_region.id,
    preferred_country_code = v_country,
    updated_at = now()
  where id = v_user_id;

  for v_group in
    select
      fulfillment_vendor_id,
      seller_vendor_id,
      max(supplier_owner_id) as supplier_owner_id,
      max(seller_owner_id) as seller_owner_id,
      sum(line_total) as listing_subtotal,
      sum(cost_line_total) as supplier_subtotal,
      sum(greatest(margin_line_total, 0)) as seller_margin,
      sum(shipping_cost_usdt) as shipping_subtotal
    from tmp_checkout_lines
    group by fulfillment_vendor_id, seller_vendor_id
    order by fulfillment_vendor_id, seller_vendor_id
  loop
    v_listing_subtotal := v_group.listing_subtotal;
    v_supplier_subtotal := v_group.supplier_subtotal;
    v_seller_margin := v_group.seller_margin;

    insert into public.orders (
      customer_id,
      vendor_id,
      seller_vendor_id,
      status,
      payment_status,
      subtotal,
      tax,
      shipping_fee,
      total,
      currency,
      shipping_address,
      buyer_region_id,
      buyer_country_code
    )
    values (
      v_user_id,
      v_group.fulfillment_vendor_id,
      v_group.seller_vendor_id,
      'paid',
      'paid',
      v_listing_subtotal,
      0,
      coalesce(v_group.shipping_subtotal, 0),
      v_listing_subtotal + coalesce(v_group.shipping_subtotal, 0),
      'USDT',
      v_shipping,
      v_region.id,
      v_country
    )
    returning id into v_order_id;

    v_order_ids := array_append(v_order_ids, v_order_id);

    insert into public.order_items (
      order_id,
      product_id,
      listing_product_id,
      source_product_id,
      product_name,
      quantity,
      unit_price,
      cost_unit_price,
      total_price,
      supplier_provider_id,
      supplier_route_id,
      warehouse_country,
      shipping_estimate_days_min,
      shipping_estimate_days_max,
      shipping_cost_usdt
    )
    select
      v_order_id,
      listing_product_id,
      listing_product_id,
      source_product_id,
      product_name,
      quantity,
      unit_price,
      cost_unit_price,
      line_total,
      supplier_provider_id,
      supplier_route_id,
      warehouse_country,
      shipping_days_min,
      shipping_days_max,
      shipping_cost_usdt
    from tmp_checkout_lines
    where fulfillment_vendor_id = v_group.fulfillment_vendor_id
      and seller_vendor_id = v_group.seller_vendor_id;

    -- Supplier / fulfillment credit (source catalog price) — USDT only.
    if v_supplier_subtotal > 0 then
      perform public.ensure_user_wallets(v_group.supplier_owner_id);

      select * into v_wallet
      from public.wallets
      where user_id = v_group.supplier_owner_id and currency = 'USDT'
      for update;

      update public.wallets
      set available_balance = available_balance + v_supplier_subtotal
      where id = v_wallet.id;

      insert into public.wallet_transactions (
        wallet_id, user_id, currency, tx_type, status, amount, reference, note
      )
      values (
        v_wallet.id,
        v_group.supplier_owner_id,
        'USDT',
        'sale_credit',
        'completed',
        v_supplier_subtotal,
        v_order_id::text,
        case
          when v_group.fulfillment_vendor_id = v_group.seller_vendor_id
            then 'Sale credit from USDT checkout'
          else 'Supplier credit from dropship USDT checkout'
        end
      );
    end if;

    -- Dropshipper margin when seller ≠ supplier.
    if v_group.seller_vendor_id is distinct from v_group.fulfillment_vendor_id
       and v_seller_margin > 0 then
      perform public.ensure_user_wallets(v_group.seller_owner_id);

      select * into v_wallet
      from public.wallets
      where user_id = v_group.seller_owner_id and currency = 'USDT'
      for update;

      update public.wallets
      set available_balance = available_balance + v_seller_margin
      where id = v_wallet.id;

      insert into public.wallet_transactions (
        wallet_id, user_id, currency, tx_type, status, amount, reference, note
      )
      values (
        v_wallet.id,
        v_group.seller_owner_id,
        'USDT',
        'sale_credit',
        'completed',
        v_seller_margin,
        v_order_id::text,
        'Dropship margin from USDT checkout'
      );
    end if;
  end loop;

  update public.products p
  set stock_quantity = p.stock_quantity - l.quantity
  from (
    select source_product_id, sum(quantity) as quantity, max(product_type) as product_type
    from tmp_checkout_lines
    group by source_product_id
  ) l
  where p.id = l.source_product_id
    and l.product_type = 'physical';

  if array_length(v_order_ids, 1) >= 1 then
    update public.wallet_transactions
    set reference = v_order_ids[1]::text
    where id = v_tx_id;
  end if;

  return jsonb_build_object(
    'order_ids', to_jsonb(v_order_ids),
    'total', v_grand_total,
    'currency', 'USDT',
    'wallet_transaction_id', v_tx_id,
    'buyer_region_code', v_region.code,
    'buyer_country_code', v_country,
    'shipping_total', v_shipping_total
  );
end;
$$;

grant execute on function public.checkout_with_usdt(jsonb, jsonb) to authenticated;

comment on function public.checkout_with_usdt(jsonb, jsonb) is
  'Pay cart with USDT wallet: routes dropship to suppliers, selects regional provider (CJ/DSers/POD/internal), preserves USDT settlement.';

-- ---------------------------------------------------------------------------
-- ensure_recommended_supplier_routes — seed CJ/DSers/POD/internal by region
-- ---------------------------------------------------------------------------

create or replace function public.ensure_recommended_supplier_routes(p_product_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.products%rowtype;
  v_inserted integer := 0;
  v_rowcount integer := 0;
  v_region public.sourcing_regions%rowtype;
  v_provider public.supplier_providers%rowtype;
  v_days_min integer;
  v_days_max integer;
  v_cost numeric(12, 2);
  v_priority integer;
  v_warehouse text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_product
  from public.products
  where id = p_product_id;

  if not found then
    raise exception 'Product not found';
  end if;

  if coalesce(v_product.is_dropship, false) then
    raise exception 'Configure supplier routes on the source catalog product, not the dropship listing';
  end if;

  if not (public.is_admin() or public.owns_vendor(v_product.vendor_id)) then
    raise exception 'Not allowed to manage supplier routes for this product';
  end if;

  for v_region in
    select * from public.sourcing_regions where is_active = true order by sort_order
  loop
    for v_provider in
      select *
      from public.supplier_providers
      where is_active = true
        and (
          v_region.code = any (supports_regions)
          or coalesce(cardinality(supports_regions), 0) = 0
        )
      order by
        case kind
          when 'internal' then 1
          when 'cj_dropshipping' then 2
          when 'dsers' then 3
          when 'print_on_demand' then 4
          else 5
        end
    loop
      -- Prefer local/internal for Myanmar; CJ for SEA/CN; Printful for US/EU; DSers as fallback.
      v_warehouse := v_provider.default_origin_country;
      v_priority := 100;
      v_days_min := 7;
      v_days_max := 21;
      v_cost := 2.50;

      if v_provider.slug = 'internal' then
        v_warehouse := 'MM';
        v_priority := case when v_region.code = 'MM' then 10 else 80 end;
        v_days_min := case when v_region.code = 'MM' then 2 else 5 end;
        v_days_max := case when v_region.code = 'MM' then 5 else 14 end;
        v_cost := case when v_region.code = 'MM' then 0 else 1.50 end;
      elsif v_provider.slug = 'cj-dropshipping' then
        v_warehouse := case
          when v_region.code in ('US', 'EU') then v_region.code
          when v_region.code = 'SEA' then 'SG'
          else 'CN'
        end;
        v_priority := case
          when v_region.code in ('SEA', 'CN', 'GLOBAL') then 20
          when v_region.code = 'MM' then 40
          else 50
        end;
        v_days_min := case when v_region.code in ('SEA', 'CN') then 3 else 7 end;
        v_days_max := case when v_region.code in ('SEA', 'CN') then 10 else 20 end;
        v_cost := case
          when v_region.code in ('SEA', 'CN') then 1.80
          when v_region.code = 'MM' then 2.20
          else 3.50
        end;
      elsif v_provider.slug = 'printful' then
        v_warehouse := case when v_region.code = 'EU' then 'DE' else 'US' end;
        v_priority := case when v_region.code in ('US', 'EU') then 15 else 90 end;
        v_days_min := 3;
        v_days_max := 8;
        v_cost := case when v_region.code in ('US', 'EU') then 2.00 else 4.50 end;
      elsif v_provider.slug = 'dsers' then
        v_warehouse := 'CN';
        v_priority := 70;
        v_days_min := 10;
        v_days_max := 30;
        v_cost := 2.00;
      end if;

      insert into public.product_supplier_routes (
        product_id,
        region_id,
        provider_id,
        warehouse_country,
        shipping_days_min,
        shipping_days_max,
        shipping_cost_usdt,
        priority,
        is_active
      )
      values (
        p_product_id,
        v_region.id,
        v_provider.id,
        v_warehouse,
        v_days_min,
        v_days_max,
        v_cost,
        v_priority,
        true
      )
      on conflict (product_id, region_id, provider_id) do nothing;

      get diagnostics v_rowcount = row_count;
      v_inserted := v_inserted + v_rowcount;
    end loop;
  end loop;

  return v_inserted;
end;
$$;

grant execute on function public.ensure_recommended_supplier_routes(uuid) to authenticated;

comment on function public.ensure_recommended_supplier_routes(uuid) is
  'Seeds recommended CJ/DSers/POD/internal routes per sourcing region for a source catalog product.';
