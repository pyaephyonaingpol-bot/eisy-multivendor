-- USDT TRC-20 payment gateway: intents, pending checkout, webhook confirmation + profit split

create table if not exists public.usdt_payment_settings (
  id int primary key default 1 check (id = 1),
  deposit_address text not null default '',
  contract_address text not null default 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
  network text not null default 'TRC20',
  min_confirmations integer not null default 1 check (min_confirmations >= 0),
  updated_at timestamptz not null default now()
);

insert into public.usdt_payment_settings (id, deposit_address)
values (1, coalesce(nullif(current_setting('app.usdt_trc20_deposit_address', true), ''), ''))
on conflict (id) do nothing;

create or replace function public.get_usdt_trc20_deposit_address()
returns text
language sql
stable
as $$
  select nullif(trim(deposit_address), '') from public.usdt_payment_settings where id = 1;
$$;

create or replace function public.get_usdt_trc20_contract_address()
returns text
language sql
stable
as $$
  select coalesce(nullif(trim(contract_address), ''), 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t')
  from public.usdt_payment_settings where id = 1;
$$;

do $$
begin
  create type public.usdt_payment_intent_status as enum (
    'pending',
    'detecting',
    'confirmed',
    'expired',
    'cancelled'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.usdt_payment_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  amount_usdt numeric(18, 6) not null check (amount_usdt > 0),
  observed_amount_usdt numeric(18, 6),
  status public.usdt_payment_intent_status not null default 'pending',
  network text not null default 'TRC20',
  deposit_address text not null,
  from_address text,
  to_address text,
  tx_hash text,
  confirmations integer not null default 0,
  order_ids uuid[] not null default '{}',
  shipping_address jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tx_hash)
);

create index if not exists usdt_payment_intents_user_idx
  on public.usdt_payment_intents (user_id, created_at desc);
create index if not exists usdt_payment_intents_status_idx
  on public.usdt_payment_intents (status, expires_at);

create table if not exists public.usdt_payment_events (
  id uuid primary key default gen_random_uuid(),
  payment_intent_id uuid not null references public.usdt_payment_intents (id) on delete cascade,
  event_type text not null,
  tx_hash text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists usdt_payment_events_intent_idx
  on public.usdt_payment_events (payment_intent_id, created_at desc);

alter table public.orders
  add column if not exists payment_intent_id uuid references public.usdt_payment_intents (id) on delete set null,
  add column if not exists payment_method text,
  add column if not exists payment_tx_hash text;

create index if not exists orders_payment_intent_id_idx
  on public.orders (payment_intent_id)
  where payment_intent_id is not null;

alter table public.usdt_payment_intents enable row level security;
alter table public.usdt_payment_events enable row level security;
alter table public.usdt_payment_settings enable row level security;

drop policy if exists "usdt_payment_intents_select_own" on public.usdt_payment_intents;
create policy "usdt_payment_intents_select_own"
  on public.usdt_payment_intents for select
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "usdt_payment_events_select_own" on public.usdt_payment_events;
create policy "usdt_payment_events_select_own"
  on public.usdt_payment_events for select
  using (
    exists (
      select 1 from public.usdt_payment_intents i
      where i.id = payment_intent_id
        and (i.user_id = auth.uid() or public.is_admin())
    )
  );

drop policy if exists "usdt_payment_settings_select_authenticated" on public.usdt_payment_settings;
create policy "usdt_payment_settings_select_authenticated"
  on public.usdt_payment_settings for select
  using (auth.uid() is not null or public.is_admin());


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


create or replace function public.confirm_usdt_trc20_payment(
  p_payment_intent_id uuid,
  p_tx_hash text,
  p_from_address text default null,
  p_to_address text default null,
  p_amount_usdt numeric default null,
  p_confirmations integer default null,
  p_raw_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_intent public.usdt_payment_intents%rowtype;
  v_order public.orders%rowtype;
  v_order_id uuid;
  v_wallet public.wallets%rowtype;
  v_supplier_owner uuid;
  v_seller_owner uuid;
  v_platform_user uuid;
  v_supplier_total numeric(18, 6);
  v_listing_total numeric(18, 6);
  v_platform_commission numeric(18, 6);
  v_seller_net numeric(18, 6);
  v_deposit_address text := public.get_usdt_trc20_deposit_address();
  v_paid_orders uuid[] := '{}';
  v_settings public.dropship_fee_settings%rowtype;
  v_commission_rate numeric(6, 4) := 0.03;
begin
  if not public.is_service_role() and not public.is_admin() then
    raise exception 'Only service role or admin can confirm TRC-20 payments';
  end if;

  if p_tx_hash is null or length(trim(p_tx_hash)) < 8 then
    raise exception 'tx_hash is required';
  end if;

  select * into v_settings from public.dropship_fee_settings where id = 1;
  v_commission_rate := coalesce(v_settings.commission_rate, 0.03);

  select * into v_intent
  from public.usdt_payment_intents
  where tx_hash = lower(trim(p_tx_hash))
    and status = 'confirmed'
  limit 1;

  if found then
    return jsonb_build_object(
      'status', 'already_confirmed',
      'payment_intent_id', v_intent.id,
      'order_ids', to_jsonb(v_intent.order_ids),
      'tx_hash', v_intent.tx_hash
    );
  end if;

  select * into v_intent
  from public.usdt_payment_intents
  where id = p_payment_intent_id
  for update;

  if not found then
    raise exception 'Payment intent not found';
  end if;

  if v_intent.status = 'confirmed' then
    return jsonb_build_object(
      'status', 'already_confirmed',
      'payment_intent_id', v_intent.id,
      'order_ids', to_jsonb(v_intent.order_ids),
      'tx_hash', v_intent.tx_hash
    );
  end if;

  if v_intent.status = 'expired' or (v_intent.expires_at is not null and v_intent.expires_at < now()) then
    update public.usdt_payment_intents
    set status = 'expired', updated_at = now()
    where id = v_intent.id;
    raise exception 'Payment intent expired';
  end if;

  if v_intent.status not in ('pending', 'detecting') then
    raise exception 'Payment intent is not awaiting payment (status=%)', v_intent.status;
  end if;

  if p_to_address is not null
     and lower(trim(p_to_address)) <> lower(v_intent.deposit_address)
     and (v_deposit_address is null or lower(trim(p_to_address)) <> lower(v_deposit_address)) then
    raise exception 'Payment sent to unexpected address';
  end if;

  if p_amount_usdt is not null and p_amount_usdt + 0.000001 < v_intent.amount_usdt then
    raise exception 'Paid amount % is less than required %', p_amount_usdt, v_intent.amount_usdt;
  end if;

  if exists (
    select 1 from public.usdt_payment_intents
    where tx_hash = lower(trim(p_tx_hash)) and id <> v_intent.id
  ) then
    raise exception 'tx_hash already used by another payment intent';
  end if;

  update public.usdt_payment_intents
  set
    status = 'detecting',
    tx_hash = lower(trim(p_tx_hash)),
    from_address = nullif(trim(coalesce(p_from_address, '')), ''),
    to_address = coalesce(nullif(trim(coalesce(p_to_address, '')), ''), deposit_address),
    observed_amount_usdt = coalesce(p_amount_usdt, amount_usdt),
    confirmations = coalesce(p_confirmations, 0),
    raw_payload = coalesce(p_raw_payload, '{}'::jsonb),
    updated_at = now()
  where id = v_intent.id;

  v_platform_user := public.get_platform_treasury_user_id();

  foreach v_order_id in array v_intent.order_ids
  loop
    select * into v_order
    from public.orders
    where id = v_order_id
    for update;

    if not found then
      continue;
    end if;

    if v_order.payment_status = 'paid' then
      v_paid_orders := array_append(v_paid_orders, v_order.id);
      continue;
    end if;

    if v_order.payment_status <> 'pending' then
      raise exception 'Order % cannot be confirmed from payment_status %', v_order.id, v_order.payment_status;
    end if;

    select coalesce(sum(coalesce(cost_unit_price, 0) * quantity), 0),
           coalesce(sum(total_price), 0),
           coalesce(sum(platform_commission_usdt), 0)
      into v_supplier_total, v_listing_total, v_platform_commission
    from public.order_items
    where order_id = v_order.id;

    v_platform_commission := coalesce(v_order.platform_commission_usdt, v_platform_commission, 0);
    v_seller_net := greatest(v_listing_total - v_supplier_total - v_platform_commission, 0);

    select owner_id into v_supplier_owner from public.vendors where id = v_order.vendor_id;
    select owner_id into v_seller_owner from public.vendors where id = v_order.seller_vendor_id;

    if v_supplier_total > 0 and v_supplier_owner is not null then
      perform public.ensure_user_wallets(v_supplier_owner);
      select * into v_wallet from public.wallets
      where user_id = v_supplier_owner and currency = 'USDT'
      for update;
      update public.wallets
      set available_balance = available_balance + v_supplier_total
      where id = v_wallet.id;
      insert into public.wallet_transactions (
        wallet_id, user_id, currency, tx_type, status, amount, reference, note
      ) values (
        v_wallet.id, v_supplier_owner, 'USDT', 'sale_credit', 'completed',
        v_supplier_total, v_order.id::text,
        'Supplier credit from confirmed TRC-20 USDT payment'
      );
    end if;

    if v_order.seller_vendor_id is distinct from v_order.vendor_id
       and v_seller_net > 0 and v_seller_owner is not null then
      perform public.ensure_user_wallets(v_seller_owner);
      select * into v_wallet from public.wallets
      where user_id = v_seller_owner and currency = 'USDT'
      for update;
      update public.wallets
      set available_balance = available_balance + v_seller_net
      where id = v_wallet.id;
      insert into public.wallet_transactions (
        wallet_id, user_id, currency, tx_type, status, amount, reference, note
      ) values (
        v_wallet.id, v_seller_owner, 'USDT', 'sale_credit', 'completed',
        v_seller_net, v_order.id::text,
        format(
          'Dropshipper margin after %s%% platform commission (TRC-20)',
          trim(to_char(v_commission_rate * 100, 'FM999990.##'))
        )
      );
    end if;

    if v_platform_commission > 0 and v_platform_user is not null then
      perform public.ensure_user_wallets(v_platform_user);
      select * into v_wallet from public.wallets
      where user_id = v_platform_user and currency = 'USDT'
      for update;
      update public.wallets
      set available_balance = available_balance + v_platform_commission
      where id = v_wallet.id;
      insert into public.wallet_transactions (
        wallet_id, user_id, currency, tx_type, status, amount, reference, note
      ) values (
        v_wallet.id, v_platform_user, 'USDT', 'platform_commission', 'completed',
        v_platform_commission, v_order.id::text,
        'Platform commission from confirmed TRC-20 USDT payment'
      );
    end if;

    update public.products p
    set stock_quantity = greatest(p.stock_quantity - l.quantity, 0)
    from (
      select source_product_id, sum(quantity) as quantity
      from public.order_items
      where order_id = v_order.id and source_product_id is not null
      group by source_product_id
    ) l
    where p.id = l.source_product_id
      and coalesce(p.product_type, 'physical') = 'physical';

    update public.orders
    set
      status = 'paid',
      payment_status = 'paid',
      payment_tx_hash = lower(trim(p_tx_hash)),
      payment_method = 'trc20',
      updated_at = now()
    where id = v_order.id;

    v_paid_orders := array_append(v_paid_orders, v_order.id);
  end loop;

  update public.usdt_payment_intents
  set
    status = 'confirmed',
    confirmed_at = now(),
    confirmations = coalesce(p_confirmations, confirmations, 0),
    updated_at = now()
  where id = v_intent.id;

  insert into public.usdt_payment_events (
    payment_intent_id, event_type, tx_hash, payload
  ) values (
    v_intent.id, 'confirmed', lower(trim(p_tx_hash)), coalesce(p_raw_payload, '{}'::jsonb)
  );

  return jsonb_build_object(
    'status', 'confirmed',
    'payment_intent_id', v_intent.id,
    'order_ids', to_jsonb(v_paid_orders),
    'tx_hash', lower(trim(p_tx_hash)),
    'amount_usdt', v_intent.amount_usdt
  );
end;
$$;

grant execute on function public.get_usdt_trc20_deposit_address() to authenticated, service_role;
grant execute on function public.get_usdt_trc20_contract_address() to authenticated, service_role;
grant execute on function public.create_usdt_trc20_checkout(jsonb, jsonb) to authenticated;
grant execute on function public.confirm_usdt_trc20_payment(uuid, text, text, text, numeric, integer, jsonb) to service_role;

comment on function public.create_usdt_trc20_checkout(jsonb, jsonb) is
  'Creates pending USDT orders + TRC-20 payment intent; settlement runs after on-chain confirmation.';
comment on function public.confirm_usdt_trc20_payment(uuid, text, text, text, numeric, integer, jsonb) is
  'Confirms TRC-20 payment, marks orders paid, and runs supplier/dropshipper/platform profit split.';
