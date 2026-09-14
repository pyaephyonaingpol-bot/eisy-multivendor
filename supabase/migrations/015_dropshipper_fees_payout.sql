-- Dropshipper fee & payout structure (Eisy Myanmar)
-- Depends on 014_dropshipper_fee_tx_types.sql (inventory_fee, platform_commission).
-- 1) Monthly inventory fee: 1 USDT × max(active dropship items, 10) when active > 0
-- 2) 3% platform commission on dropship checkout GMV (capped at dropshipper margin)
-- 3) USDT checkout + USDT deposit/withdraw + MMK withdraw-only unchanged

-- ---------------------------------------------------------------------------
-- Fee settings (singleton)
-- ---------------------------------------------------------------------------

create table if not exists public.dropship_fee_settings (
  id integer primary key default 1 check (id = 1),
  item_fee_usdt numeric(12, 2) not null default 1.00 check (item_fee_usdt >= 0),
  min_billable_items integer not null default 10 check (min_billable_items >= 1),
  commission_rate numeric(6, 4) not null default 0.0300
    check (commission_rate >= 0 and commission_rate <= 1),
  updated_at timestamptz not null default now()
);

insert into public.dropship_fee_settings (id)
values (1)
on conflict (id) do nothing;

comment on table public.dropship_fee_settings is
  'Dropship inventory fee (USDT/item, min items) and platform commission rate.';

-- ---------------------------------------------------------------------------
-- Monthly inventory fee invoices
-- ---------------------------------------------------------------------------

do $$
begin
  create type public.dropship_fee_invoice_status as enum (
    'pending',
    'paid',
    'failed',
    'waived'
  );
exception
  when duplicate_object then null;
end;
$$;

create table if not exists public.dropship_inventory_fee_invoices (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors (id) on delete cascade,
  billing_month date not null,
  active_item_count integer not null default 0 check (active_item_count >= 0),
  billable_item_count integer not null check (billable_item_count >= 0),
  unit_fee_usdt numeric(12, 2) not null check (unit_fee_usdt >= 0),
  amount_usdt numeric(18, 6) not null check (amount_usdt >= 0),
  status public.dropship_fee_invoice_status not null default 'pending',
  wallet_transaction_id uuid references public.wallet_transactions (id) on delete set null,
  charged_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vendor_id, billing_month)
);

create index if not exists dropship_inventory_fee_invoices_vendor_idx
  on public.dropship_inventory_fee_invoices (vendor_id, billing_month desc);

create index if not exists dropship_inventory_fee_invoices_status_idx
  on public.dropship_inventory_fee_invoices (status);

comment on table public.dropship_inventory_fee_invoices is
  'Monthly dropshipper inventory fees: 1 USDT × max(active items, 10) when active > 0.';

drop trigger if exists dropship_inventory_fee_invoices_set_updated_at
  on public.dropship_inventory_fee_invoices;
create trigger dropship_inventory_fee_invoices_set_updated_at
  before update on public.dropship_inventory_fee_invoices
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Order commission columns
-- ---------------------------------------------------------------------------

alter table public.orders
  add column if not exists platform_commission_usdt numeric(18, 6) not null default 0;

alter table public.order_items
  add column if not exists platform_commission_usdt numeric(18, 6) not null default 0;

do $$
begin
  alter table public.orders
    add constraint orders_platform_commission_usdt_nonneg
    check (platform_commission_usdt >= 0);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.order_items
    add constraint order_items_platform_commission_usdt_nonneg
    check (platform_commission_usdt >= 0);
exception when duplicate_object then null;
end $$;

comment on column public.orders.platform_commission_usdt is
  '3% platform commission on dropship GMV for this order (0 for direct sales).';
comment on column public.order_items.platform_commission_usdt is
  '3% platform commission for this dropship line (0 for direct sales).';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.dropship_fee_settings enable row level security;
alter table public.dropship_inventory_fee_invoices enable row level security;

drop policy if exists "dropship_fee_settings_select_authenticated"
  on public.dropship_fee_settings;
create policy "dropship_fee_settings_select_authenticated"
  on public.dropship_fee_settings for select
  to authenticated
  using (true);

drop policy if exists "dropship_fee_settings_admin_write"
  on public.dropship_fee_settings;
create policy "dropship_fee_settings_admin_write"
  on public.dropship_fee_settings for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "dropship_fee_invoices_select_owner_or_admin"
  on public.dropship_inventory_fee_invoices;
create policy "dropship_fee_invoices_select_owner_or_admin"
  on public.dropship_inventory_fee_invoices for select
  using (public.is_admin() or public.owns_vendor(vendor_id));

drop policy if exists "dropship_fee_invoices_admin_write"
  on public.dropship_inventory_fee_invoices;
create policy "dropship_fee_invoices_admin_write"
  on public.dropship_inventory_fee_invoices for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.get_platform_treasury_user_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  select id into v_user_id
  from public.profiles
  where role = 'admin'
  order by
    case when lower(email) = 'pyaephyonaing.pol@gmail.com' then 0 else 1 end,
    created_at asc
  limit 1;

  return v_user_id;
end;
$$;

create or replace function public.count_active_dropship_items(p_vendor_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(count(*)::integer, 0)
  from public.products
  where vendor_id = p_vendor_id
    and coalesce(is_dropship, false) = true
    and status = 'active';
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
    from public.products
    where vendor_id = p_vendor_id
      and coalesce(is_dropship, false) = true
  );
$$;

create or replace function public.billing_month_start(p_day date default current_date)
returns date
language sql
immutable
as $$
  select date_trunc('month', p_day::timestamp)::date;
$$;

create or replace function public.preview_dropship_inventory_fee(
  p_vendor_id uuid,
  p_billing_month date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_month date := public.billing_month_start(coalesce(p_billing_month, current_date));
  v_settings public.dropship_fee_settings%rowtype;
  v_active integer;
  v_billable integer;
  v_amount numeric(18, 6);
  v_invoice public.dropship_inventory_fee_invoices%rowtype;
begin
  if p_vendor_id is null then
    raise exception 'Vendor id required';
  end if;

  if not (public.is_admin() or public.owns_vendor(p_vendor_id)) then
    raise exception 'Not allowed to preview fees for this vendor';
  end if;

  select * into v_settings from public.dropship_fee_settings where id = 1;
  v_active := public.count_active_dropship_items(p_vendor_id);

  if not public.vendor_is_dropshipper(p_vendor_id) then
    return jsonb_build_object(
      'vendor_id', p_vendor_id,
      'billing_month', v_month,
      'is_dropshipper', false,
      'active_item_count', v_active,
      'billable_item_count', 0,
      'unit_fee_usdt', v_settings.item_fee_usdt,
      'min_billable_items', v_settings.min_billable_items,
      'commission_rate', v_settings.commission_rate,
      'amount_usdt', 0,
      'invoice_status', null
    );
  end if;

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
  limit 1;

  return jsonb_build_object(
    'vendor_id', p_vendor_id,
    'billing_month', v_month,
    'is_dropshipper', true,
    'active_item_count', v_active,
    'billable_item_count', v_billable,
    'unit_fee_usdt', v_settings.item_fee_usdt,
    'min_billable_items', v_settings.min_billable_items,
    'commission_rate', v_settings.commission_rate,
    'amount_usdt', v_amount,
    'invoice_id', v_invoice.id,
    'invoice_status', v_invoice.status
  );
end;
$$;

grant execute on function public.preview_dropship_inventory_fee(uuid, date) to authenticated;

create or replace function public.charge_dropship_inventory_fee(
  p_vendor_id uuid,
  p_billing_month date default null
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
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not (public.is_admin() or public.owns_vendor(p_vendor_id)) then
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
      status
    )
    values (
      p_vendor_id,
      v_month,
      v_active,
      v_billable,
      v_settings.item_fee_usdt,
      v_amount,
      'pending'
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
      updated_at = now()
    where id = v_invoice.id
    returning * into v_invoice;
  end if;

  if v_amount <= 0 then
    update public.dropship_inventory_fee_invoices
    set status = 'waived', charged_at = now(), note = 'Zero amount'
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
      'Dropship inventory fee %s: %s active → %s billable × %s USDT',
      to_char(v_month, 'YYYY-MM'),
      v_active,
      v_billable,
      v_settings.item_fee_usdt
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
          'Inventory fee collected from vendor %s for %s',
          p_vendor_id,
          to_char(v_month, 'YYYY-MM')
        )
      );
    end if;
  end if;

  update public.dropship_inventory_fee_invoices
  set
    status = 'paid',
    wallet_transaction_id = v_tx_id,
    charged_at = now(),
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
    'wallet_transaction_id', v_tx_id
  );
end;
$$;

grant execute on function public.charge_dropship_inventory_fee(uuid, date) to authenticated;

create or replace function public.charge_all_dropship_inventory_fees(
  p_billing_month date default null
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
  v_errors jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only admins can charge all inventory fees';
  end if;

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
      v_result := public.charge_dropship_inventory_fee(v_vendor.id, v_month);
      if (v_result->>'status') = 'paid' then
        v_paid := v_paid + 1;
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

  return jsonb_build_object(
    'billing_month', v_month,
    'paid', v_paid,
    'failed', v_failed,
    'skipped', v_skipped,
    'errors', v_errors
  );
end;
$$;

grant execute on function public.charge_all_dropship_inventory_fees(date) to authenticated;

-- ---------------------------------------------------------------------------
-- checkout_with_usdt — add 3% dropship platform commission to payment split
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

    -- Dropshipper net margin (markup − 3% platform commission).
    if v_group.seller_vendor_id is distinct from v_group.fulfillment_vendor_id
       and v_seller_net > 0 then
      perform public.ensure_user_wallets(v_group.seller_owner_id);

      select * into v_wallet
      from public.wallets
      where user_id = v_group.seller_owner_id and currency = 'USDT'
      for update;

      update public.wallets
      set available_balance = available_balance + v_seller_net
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
        v_seller_net,
        v_order_id::text,
        format(
          'Dropship margin after %s%% platform commission',
          trim(to_char(v_commission_rate * 100, 'FM999990.##'))
        )
      );
    end if;

    -- Platform commission credit (dropship sales only).
    if v_platform_commission > 0 and v_platform_user_id is not null then
      perform public.ensure_user_wallets(v_platform_user_id);

      select * into v_wallet
      from public.wallets
      where user_id = v_platform_user_id and currency = 'USDT'
      for update;

      update public.wallets
      set available_balance = available_balance + v_platform_commission
      where id = v_wallet.id;

      insert into public.wallet_transactions (
        wallet_id, user_id, currency, tx_type, status, amount, reference, note
      )
      values (
        v_wallet.id,
        v_platform_user_id,
        'USDT',
        'platform_commission',
        'completed',
        v_platform_commission,
        v_order_id::text,
        format(
          'Platform commission (%s%%) from dropship order',
          trim(to_char(v_commission_rate * 100, 'FM999990.##'))
        )
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
    'shipping_total', v_shipping_total,
    'platform_commission_total', v_commission_total,
    'commission_rate', v_commission_rate
  );
end;
$$;

grant execute on function public.checkout_with_usdt(jsonb, jsonb) to authenticated;

comment on function public.checkout_with_usdt(jsonb, jsonb) is
  'USDT checkout with regional routing; dropship split = supplier cost + dropshipper net margin + 3% platform commission. Wallet USDT/MMK rules unchanged.';
