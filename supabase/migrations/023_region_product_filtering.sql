-- =============================================================================
-- 023_region_product_filtering.sql
-- Region attributes on products + deliverability filtering/validation.
-- Profiles already have preferred_region_id / preferred_country_code (013).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Product listing region attributes
-- ---------------------------------------------------------------------------

alter table public.products
  add column if not exists origin_country_code text;

alter table public.products
  add column if not exists origin_region_id uuid
    references public.sourcing_regions (id) on delete set null;

alter table public.products
  add column if not exists ships_to_region_ids uuid[] not null default '{}'::uuid[];

comment on column public.products.origin_country_code is
  'Primary warehouse / origin country for this listing (ISO-2).';
comment on column public.products.origin_region_id is
  'Primary sourcing region for this listing.';
comment on column public.products.ships_to_region_ids is
  'When non-empty, listing is only sellable to these sourcing_regions. Empty = derive from supplier routes (and local inventory defaults).';

create index if not exists products_origin_region_id_idx
  on public.products (origin_region_id);

create index if not exists products_ships_to_region_ids_gin
  on public.products using gin (ships_to_region_ids);

-- Backfill origin from default Myanmar region when missing.
update public.products p
set
  origin_country_code = coalesce(nullif(trim(p.origin_country_code), ''), 'MM'),
  origin_region_id = coalesce(
    p.origin_region_id,
    (select id from public.sourcing_regions where code = 'MM' and is_active = true limit 1)
  )
where p.origin_region_id is null
   or p.origin_country_code is null
   or trim(p.origin_country_code) = '';

-- ---------------------------------------------------------------------------
-- 2) Deliverability helper (strict — no synthetic internal fallback)
-- ---------------------------------------------------------------------------

create or replace function public.product_is_deliverable_to_country(
  p_product_id uuid,
  p_country_code text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_product public.products%rowtype;
  v_source_id uuid;
  v_region public.sourcing_regions%rowtype;
  v_global_id uuid;
  v_has_any_route boolean := false;
begin
  if p_product_id is null then
    return false;
  end if;

  select * into v_product
  from public.products
  where id = p_product_id;

  if not found then
    return false;
  end if;

  -- Digital goods are region-agnostic.
  if coalesce(v_product.product_type, 'physical') = 'digital' then
    return true;
  end if;

  v_region := public.resolve_sourcing_region(p_country_code);
  if v_region.id is null then
    return false;
  end if;

  -- Explicit ships_to restriction on the storefront listing.
  if coalesce(cardinality(v_product.ships_to_region_ids), 0) > 0
     and not (v_region.id = any (v_product.ships_to_region_ids)) then
    return false;
  end if;

  v_source_id := case
    when coalesce(v_product.is_dropship, false) and v_product.source_product_id is not null
      then v_product.source_product_id
    else v_product.id
  end;

  select id into v_global_id
  from public.sourcing_regions
  where code = 'GLOBAL' and is_active = true
  limit 1;

  -- Active supplier route for the buyer region.
  if exists (
    select 1
    from public.product_supplier_routes r
    join public.supplier_providers sp on sp.id = r.provider_id
    where r.product_id = v_source_id
      and r.region_id = v_region.id
      and r.is_active = true
      and sp.is_active = true
  ) then
    return true;
  end if;

  -- GLOBAL catch-all route.
  if v_global_id is not null and exists (
    select 1
    from public.product_supplier_routes r
    join public.supplier_providers sp on sp.id = r.provider_id
    where r.product_id = v_source_id
      and r.region_id = v_global_id
      and r.is_active = true
      and sp.is_active = true
  ) then
    return true;
  end if;

  select exists (
    select 1
    from public.product_supplier_routes r
    join public.supplier_providers sp on sp.id = r.provider_id
    where r.product_id = v_source_id
      and r.is_active = true
      and sp.is_active = true
  ) into v_has_any_route;

  -- Local (non-dropship) inventory with no routes configured: treat as
  -- deliverable unless ships_to_region_ids explicitly excludes the region
  -- (already enforced above).
  if not coalesce(v_product.is_dropship, false) and not v_has_any_route then
    return true;
  end if;

  -- Dropship / routed catalog without a matching region or GLOBAL route.
  return false;
end;
$$;

revoke all on function public.product_is_deliverable_to_country(uuid, text) from public;
grant execute on function public.product_is_deliverable_to_country(uuid, text) to anon, authenticated, service_role;

create or replace function public.assert_cart_deliverable_to_country(
  p_items jsonb,
  p_country_code text
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_product_id uuid;
  v_product public.products%rowtype;
  v_country text := upper(nullif(trim(coalesce(p_country_code, '')), ''));
begin
  if v_country is null then
    v_country := 'MM';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    return;
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    begin
      v_product_id := (v_item->>'product_id')::uuid;
    exception when others then
      continue;
    end;

    if v_product_id is null then
      continue;
    end if;

    select * into v_product from public.products where id = v_product_id;
    if not found then
      continue;
    end if;

    if not public.product_is_deliverable_to_country(v_product_id, v_country) then
      raise exception
        '% cannot be delivered to %. Update your shipping country or remove it from the cart.',
        v_product.name,
        v_country;
    end if;
  end loop;
end;
$$;

revoke all on function public.assert_cart_deliverable_to_country(jsonb, text) from public;
grant execute on function public.assert_cart_deliverable_to_country(jsonb, text) to authenticated, service_role;

create or replace function public.filter_deliverable_product_ids(
  p_product_ids uuid[],
  p_country_code text
)
returns uuid[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_out uuid[] := '{}'::uuid[];
begin
  if p_product_ids is null or cardinality(p_product_ids) = 0 then
    return v_out;
  end if;

  foreach v_id in array p_product_ids
  loop
    if public.product_is_deliverable_to_country(v_id, p_country_code) then
      v_out := array_append(v_out, v_id);
    end if;
  end loop;

  return v_out;
end;
$$;

revoke all on function public.filter_deliverable_product_ids(uuid[], text) from public;
grant execute on function public.filter_deliverable_product_ids(uuid[], text) to anon, authenticated, service_role;

comment on function public.product_is_deliverable_to_country(uuid, text) is
  'True when the listing can ship to the buyer country via ships_to_region_ids and/or active supplier routes.';
comment on function public.assert_cart_deliverable_to_country(jsonb, text) is
  'Raises if any cart line cannot ship to the destination country.';
comment on function public.filter_deliverable_product_ids(uuid[], text) is
  'Returns the subset of product ids deliverable to the given country.';


-- ---------------------------------------------------------------------------
-- 3) Checkout RPCs: reject undeliverable cart lines
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
  v_settings public.dropship_fee_settings%rowtype;
  v_commission_rate numeric(6, 4) := 0.03;
  v_platform_commission numeric(18, 6) := 0;
  v_seller_net numeric(18, 6) := 0;
  v_platform_user_id uuid;
  v_commission_total numeric(18, 6) := 0;
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

  perform public.assert_cart_deliverable_to_country(p_items, v_country);

  v_region := public.resolve_sourcing_region(v_country);

  select * into v_settings from public.dropship_fee_settings where id = 1;
  v_commission_rate := coalesce(v_settings.commission_rate, 0.03);
  v_platform_user_id := public.get_platform_treasury_user_id();

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
    platform_commission_usdt numeric(18, 6) not null default 0,
    product_type text not null,
    is_dropship_sale boolean not null default false,
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

    
    if not public.product_is_deliverable_to_country(v_listing.id, v_country) then
      raise exception
        '% cannot be delivered to %. Choose another shipping country or remove it from your cart.',
        v_listing.name,
        v_country;
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
      platform_commission_usdt,
      product_type,
      is_dropship_sale,
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
      case
        when coalesce(v_listing.is_dropship, false)
          and v_listing.vendor_id is distinct from v_fulfill.vendor_id
          then least(
            round(v_listing.price * v_qty * v_commission_rate, 6),
            greatest(round((v_listing.price - v_fulfill.price) * v_qty, 6), 0)
          )
        else 0
      end,
      coalesce(v_fulfill.product_type, 'physical'),
      coalesce(v_listing.is_dropship, false)
        and v_listing.vendor_id is distinct from v_fulfill.vendor_id,
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
      sum(platform_commission_usdt) as platform_commission,
      sum(shipping_cost_usdt) as shipping_subtotal,
      bool_or(is_dropship_sale) as is_dropship_sale
    from tmp_checkout_lines
    group by fulfillment_vendor_id, seller_vendor_id
    order by fulfillment_vendor_id, seller_vendor_id
  loop
    v_listing_subtotal := v_group.listing_subtotal;
    v_supplier_subtotal := v_group.supplier_subtotal;
    v_seller_margin := v_group.seller_margin;
    v_platform_commission := coalesce(v_group.platform_commission, 0);
    if v_platform_commission > 0 and v_platform_user_id is null then
      raise exception 'Platform treasury is not configured for commission settlement';
    end if;
    -- listing = supplier cost + platform commission + dropshipper net
    v_seller_net := greatest(v_seller_margin - v_platform_commission, 0);
    v_commission_total := v_commission_total + v_platform_commission;

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
      buyer_country_code,
      platform_commission_usdt
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
      v_country,
      v_platform_commission
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
      shipping_cost_usdt,
      platform_commission_usdt
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
      shipping_cost_usdt,
      platform_commission_usdt
    from tmp_checkout_lines
    where fulfillment_vendor_id = v_group.fulfillment_vendor_id
      and seller_vendor_id = v_group.seller_vendor_id;

    update public.orders
    set payout_status = 'held', payout_released_at = null
    where id = v_order_id;

    -- Supplier / fulfillment credit held in escrow until order is delivered.
    if v_supplier_subtotal > 0 then
      perform public.hold_sale_in_escrow(
        v_order_id,
        v_group.supplier_owner_id,
        'supplier',
        v_supplier_subtotal,
        case
          when v_group.fulfillment_vendor_id = v_group.seller_vendor_id
            then 'Sale held in escrow from USDT checkout'
          else 'Supplier credit held in escrow from dropship USDT checkout'
        end
      );
    end if;

    -- Dropshipper net margin held in escrow (markup − 3% platform commission).
    if v_group.seller_vendor_id is distinct from v_group.fulfillment_vendor_id
       and v_seller_net > 0 then
      perform public.hold_sale_in_escrow(
        v_order_id,
        v_group.seller_owner_id,
        'seller',
        v_seller_net,
        format(
          'Dropship net margin held in escrow after %s%% platform commission',
          trim(to_char(v_commission_rate * 100, 'FM999990.##'))
        )
      );
    end if;

    -- Platform commission held in escrow until delivery confirmation.
    if v_platform_commission > 0 and v_platform_user_id is not null then
      perform public.hold_sale_in_escrow(
        v_order_id,
        v_platform_user_id,
        'platform',
        v_platform_commission,
        format(
          'Platform commission (%s%%) held in escrow from dropship order',
          trim(to_char(v_commission_rate * 100, 'FM999990.##'))
        )
      );
    end if;

    update public.orders
    set
      payout_status = 'held',
      payout_released_at = null
    where id = v_order_id;
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
    'shipping_total', v_shipping_total,
    'platform_commission_total', v_commission_total,
    'commission_rate', v_commission_rate
  );
end;
$$;

create or replace function public.create_usdt_trc20_checkout(
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
  v_settings public.dropship_fee_settings%rowtype;
  v_commission_rate numeric(6, 4) := 0.03;
  v_platform_commission numeric(18, 6) := 0;
  v_seller_net numeric(18, 6) := 0;
  v_platform_user_id uuid;
  v_commission_total numeric(18, 6) := 0;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if public.get_usdt_trc20_deposit_address() is null then
    raise exception 'USDT TRC-20 deposit address is not configured';
  end if;


  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Cart is empty';
  end if;

  if v_country is null then
    v_country := 'MM';
  end if;

  perform public.assert_cart_deliverable_to_country(p_items, v_country);

  v_region := public.resolve_sourcing_region(v_country);

  select * into v_settings from public.dropship_fee_settings where id = 1;
  v_commission_rate := coalesce(v_settings.commission_rate, 0.03);
  v_platform_user_id := public.get_platform_treasury_user_id();

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
    platform_commission_usdt numeric(18, 6) not null default 0,
    product_type text not null,
    is_dropship_sale boolean not null default false,
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

    
    if not public.product_is_deliverable_to_country(v_listing.id, v_country) then
      raise exception
        '% cannot be delivered to %. Choose another shipping country or remove it from your cart.',
        v_listing.name,
        v_country;
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
      platform_commission_usdt,
      product_type,
      is_dropship_sale,
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
      case
        when coalesce(v_listing.is_dropship, false)
          and v_listing.vendor_id is distinct from v_fulfill.vendor_id
          then least(
            round(v_listing.price * v_qty * v_commission_rate, 6),
            greatest(round((v_listing.price - v_fulfill.price) * v_qty, 6), 0)
          )
        else 0
      end,
      coalesce(v_fulfill.product_type, 'physical'),
      coalesce(v_listing.is_dropship, false)
        and v_listing.vendor_id is distinct from v_fulfill.vendor_id,
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

  -- TRC-20: no wallet debit; settlement happens after on-chain confirmation.

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
      sum(platform_commission_usdt) as platform_commission,
      sum(shipping_cost_usdt) as shipping_subtotal,
      bool_or(is_dropship_sale) as is_dropship_sale
    from tmp_checkout_lines
    group by fulfillment_vendor_id, seller_vendor_id
    order by fulfillment_vendor_id, seller_vendor_id
  loop
    v_listing_subtotal := v_group.listing_subtotal;
    v_supplier_subtotal := v_group.supplier_subtotal;
    v_seller_margin := v_group.seller_margin;
    v_platform_commission := coalesce(v_group.platform_commission, 0);
    if v_platform_commission > 0 and v_platform_user_id is null then
      raise exception 'Platform treasury is not configured for commission settlement';
    end if;
    -- listing = supplier cost + platform commission + dropshipper net
    v_seller_net := greatest(v_seller_margin - v_platform_commission, 0);
    v_commission_total := v_commission_total + v_platform_commission;

    insert into public.orders (
      customer_id,
      vendor_id,
      seller_vendor_id,
      status,
      payment_status,
      payment_method,
      subtotal,
      tax,
      shipping_fee,
      total,
      currency,
      shipping_address,
      buyer_region_id,
      buyer_country_code,
      platform_commission_usdt
    )
    values (
      v_user_id,
      v_group.fulfillment_vendor_id,
      v_group.seller_vendor_id,
      'pending',
      'pending',
      'trc20',
      v_listing_subtotal,
      0,
      coalesce(v_group.shipping_subtotal, 0),
      v_listing_subtotal + coalesce(v_group.shipping_subtotal, 0),
      'USDT',
      v_shipping,
      v_region.id,
      v_country,
      v_platform_commission
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
      shipping_cost_usdt,
      platform_commission_usdt
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
      shipping_cost_usdt,
      platform_commission_usdt
    from tmp_checkout_lines
    where fulfillment_vendor_id = v_group.fulfillment_vendor_id
      and seller_vendor_id = v_group.seller_vendor_id;

  end loop;

  -- Stock decremented on TRC-20 confirmation.

  insert into public.usdt_payment_intents (
    user_id,
    amount_usdt,
    status,
    deposit_address,
    network,
    order_ids,
    shipping_address,
    expires_at
  )
  values (
    v_user_id,
    v_grand_total,
    'pending',
    public.get_usdt_trc20_deposit_address(),
    'TRC20',
    v_order_ids,
    v_shipping,
    now() + interval '2 hours'
  )
  returning id into v_tx_id;

  update public.orders
  set
    payment_intent_id = v_tx_id,
    payment_method = 'trc20'
  where id = any(v_order_ids);

  insert into public.usdt_payment_events (
    payment_intent_id, event_type, payload
  ) values (
    v_tx_id,
    'created',
    jsonb_build_object(
      'order_ids', to_jsonb(v_order_ids),
      'amount_usdt', v_grand_total,
      'deposit_address', public.get_usdt_trc20_deposit_address()
    )
  );

  return jsonb_build_object(
    'order_ids', to_jsonb(v_order_ids),
    'total', v_grand_total,
    'currency', 'USDT',
    'payment_method', 'trc20',
    'payment_intent_id', v_tx_id,
    'deposit_address', public.get_usdt_trc20_deposit_address(),
    'network', 'TRC20',
    'usdt_contract', public.get_usdt_trc20_contract_address(),
    'expires_at', (now() + interval '2 hours'),
    'buyer_region_code', v_region.code,
    'buyer_country_code', v_country,
    'shipping_total', v_shipping_total,
    'platform_commission_total', v_commission_total,
    'commission_rate', v_commission_rate
  );
end;
$$;

grant execute on function public.checkout_with_usdt(jsonb, jsonb) to authenticated;
grant execute on function public.create_usdt_trc20_checkout(jsonb, jsonb) to authenticated;

comment on function public.checkout_with_usdt(jsonb, jsonb) is
  'USDT wallet checkout with region deliverability enforcement.';
comment on function public.create_usdt_trc20_checkout(jsonb, jsonb) is
  'TRC-20 checkout with region deliverability enforcement.';
