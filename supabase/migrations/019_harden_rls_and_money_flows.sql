-- Pre-deploy hardening: strict RLS by role + money-flow safety fixes.
-- Buyers / vendors / admins must not spoof paid orders, self-approve stores,
-- or mutate wallets outside SECURITY DEFINER RPCs.

-- ---------------------------------------------------------------------------
-- 1) Orders / order_items — checkout & fulfillment via RPC only
-- ---------------------------------------------------------------------------

drop policy if exists "orders_insert_customer" on public.orders;
drop policy if exists "orders_update_customer_vendor_or_admin" on public.orders;
drop policy if exists "order_items_insert_customer" on public.order_items;
drop policy if exists "order_items_select_via_order" on public.order_items;

-- Keep SELECT for buyers, fulfilling vendors, dropship sellers, and admins.
drop policy if exists "orders_select_customer_vendor_or_admin" on public.orders;
create policy "orders_select_customer_vendor_or_admin"
  on public.orders for select
  using (
    customer_id = auth.uid()
    or public.owns_vendor(vendor_id)
    or public.owns_vendor(seller_vendor_id)
    or public.is_admin()
  );

-- No client INSERT/UPDATE on orders: create via checkout_* RPCs,
-- mutate fulfillment via sync_order_fulfillment (SECURITY DEFINER).

create policy "order_items_select_via_order"
  on public.order_items for select
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and (
          o.customer_id = auth.uid()
          or public.owns_vendor(o.vendor_id)
          or public.owns_vendor(o.seller_vendor_id)
          or public.is_admin()
        )
    )
  );

-- ---------------------------------------------------------------------------
-- 2) Vendors — no self-approval / commission tampering
-- ---------------------------------------------------------------------------

drop policy if exists "vendors_insert_owner" on public.vendors;
-- Vendor rows are created only via apply_for_vendor() (SECURITY DEFINER).

create or replace function public.protect_vendor_privileged_columns()
returns trigger
language plpgsql
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.status := 'pending';
    new.commission_rate := coalesce(new.commission_rate, 10.00);
  elsif tg_op = 'UPDATE' then
    new.status := old.status;
    new.commission_rate := old.commission_rate;
    new.owner_id := old.owner_id;
  end if;

  return new;
end;
$$;

drop trigger if exists vendors_protect_privileged_columns on public.vendors;
create trigger vendors_protect_privileged_columns
  before insert or update on public.vendors
  for each row execute function public.protect_vendor_privileged_columns();

-- ---------------------------------------------------------------------------
-- 3) Subscriptions — admin write only (no self-upgrade to pro)
-- ---------------------------------------------------------------------------

drop policy if exists "subscriptions_insert_own" on public.subscriptions;
drop policy if exists "subscriptions_update_own_or_admin" on public.subscriptions;

create policy "subscriptions_admin_insert"
  on public.subscriptions for insert
  with check (public.is_admin());

create policy "subscriptions_admin_update"
  on public.subscriptions for update
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 4) USDT payment settings — admin write; authenticated read deposit address
-- ---------------------------------------------------------------------------

drop policy if exists "usdt_payment_settings_select_authenticated" on public.usdt_payment_settings;
create policy "usdt_payment_settings_select_authenticated"
  on public.usdt_payment_settings for select
  using (auth.uid() is not null);

create policy "usdt_payment_settings_admin_write"
  on public.usdt_payment_settings for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 5) ensure_user_wallets — no IDOR wallet bootstrap for other users
-- ---------------------------------------------------------------------------

create or replace function public.ensure_user_wallets(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    raise exception 'user_id is required';
  end if;

  -- Allow: self, admin, service role, or internal SECURITY DEFINER callers
  -- when auth.uid() is null (trigger / nested definer context).
  if auth.uid() is not null
     and auth.uid() is distinct from p_user_id
     and not public.is_admin()
     and not public.is_service_role() then
    raise exception 'Not allowed to ensure wallets for another user';
  end if;

  insert into public.wallets (user_id, currency)
  values
    (p_user_id, 'USDT'),
    (p_user_id, 'MMK')
  on conflict (user_id, currency) do nothing;
end;
$$;

revoke all on function public.ensure_user_wallets(uuid) from public;
grant execute on function public.ensure_user_wallets(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6) Dropship import — listing price must cover supplier cost
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
      'status', v_new.status
    );
  end if;

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
grant execute on function public.import_dropship_product(uuid, numeric, public.product_status) to authenticated;

-- ---------------------------------------------------------------------------
-- ---------------------------------------------------------------------------
-- 7) Inventory fee: persist "failed" without rolling back via RAISE
-- ---------------------------------------------------------------------------

create or replace function public.charge_dropship_inventory_fee(
  p_vendor_id uuid,
  p_billing_month date default null,
  p_charge_run_id uuid default null
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
  v_actor uuid := auth.uid();
  v_is_service boolean := public.is_service_role();
begin
  if v_actor is null and not v_is_service then
    raise exception 'Not authenticated';
  end if;

  if not (
    v_is_service
    or public.is_admin()
    or public.owns_vendor(p_vendor_id)
  ) then
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
      status,
      charge_run_id
    )
    values (
      p_vendor_id,
      v_month,
      v_active,
      v_billable,
      v_settings.item_fee_usdt,
      v_amount,
      'pending',
      p_charge_run_id
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
      charge_run_id = coalesce(p_charge_run_id, charge_run_id),
      updated_at = now()
    where id = v_invoice.id
    returning * into v_invoice;
  end if;

  if v_amount <= 0 then
    update public.dropship_inventory_fee_invoices
    set
      status = 'waived',
      charged_at = now(),
      charged_by = v_actor,
      charge_run_id = coalesce(p_charge_run_id, charge_run_id),
      note = 'Zero amount'
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
      charge_run_id = coalesce(p_charge_run_id, charge_run_id),
      updated_at = now()
    where id = v_invoice.id
    returning * into v_invoice;

    -- Return failed instead of RAISE so the status write commits.
    return jsonb_build_object(
      'invoice_id', v_invoice.id,
      'status', 'failed',
      'amount_usdt', v_amount,
      'message', format(
        'Insufficient USDT balance for monthly inventory fee (%s USDT required for %s billable items)',
        v_amount,
        v_billable
      )
    );
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
      'Dropship inventory fee %s: %s active → %s billable × %s USDT%s',
      to_char(v_month, 'YYYY-MM'),
      v_active,
      v_billable,
      v_settings.item_fee_usdt,
      case when v_is_service then ' (cron)' else '' end
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
          'Inventory fee collected from vendor %s for %s%s',
          p_vendor_id,
          to_char(v_month, 'YYYY-MM'),
          case when v_is_service then ' (cron)' else '' end
        )
      );
    end if;
  end if;

  update public.dropship_inventory_fee_invoices
  set
    status = 'paid',
    wallet_transaction_id = v_tx_id,
    charged_at = now(),
    charged_by = v_actor,
    charge_run_id = coalesce(p_charge_run_id, charge_run_id),
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
    'wallet_transaction_id', v_tx_id,
    'charge_run_id', p_charge_run_id
  );
end;
$$;

revoke all on function public.charge_dropship_inventory_fee(uuid, date, uuid) from public;
grant execute on function public.charge_dropship_inventory_fee(uuid, date, uuid)
  to authenticated, service_role;

-- 8) Confirm TRC-20: require amount match + fail closed on stock
-- ---------------------------------------------------------------------------
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

  if p_amount_usdt is null then
    raise exception 'Paid amount is required for confirmation';
  end if;

  if p_amount_usdt + 0.000001 < v_intent.amount_usdt then
    raise exception 'Paid amount % is less than required %', p_amount_usdt, v_intent.amount_usdt;
  end if;

  -- Reject overpayment claims against a smaller intent (shared deposit address).
  if p_amount_usdt > v_intent.amount_usdt * 1.02 + 0.000001 then
    raise exception 'Paid amount % does not match intent amount %', p_amount_usdt, v_intent.amount_usdt;
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

    -- Fail closed on insufficient stock (no silent clamp / oversell).
    if exists (
      select 1
      from public.order_items oi
      join public.products p on p.id = oi.source_product_id
      where oi.order_id = v_order.id
        and oi.source_product_id is not null
        and coalesce(p.product_type, 'physical') = 'physical'
      group by p.id, p.stock_quantity
      having p.stock_quantity < sum(oi.quantity)
    ) then
      raise exception 'Insufficient stock to confirm order %', v_order.id;
    end if;

    update public.products p
    set stock_quantity = p.stock_quantity - l.quantity
    from (
      select source_product_id, sum(quantity) as quantity
      from public.order_items
      where order_id = v_order.id and source_product_id is not null
      group by source_product_id
    ) l
    where p.id = l.source_product_id
      and coalesce(p.product_type, 'physical') = 'physical'
      and p.stock_quantity >= l.quantity;

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
revoke all on function public.confirm_usdt_trc20_payment(uuid, text, text, text, numeric, integer, jsonb) from public;
grant execute on function public.confirm_usdt_trc20_payment(uuid, text, text, text, numeric, integer, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 9) Revoke PUBLIC execute on money RPCs (match apply_for_vendor pattern)
-- ---------------------------------------------------------------------------

revoke all on function public.checkout_with_usdt(jsonb, jsonb) from public;
grant execute on function public.checkout_with_usdt(jsonb, jsonb) to authenticated;

revoke all on function public.create_usdt_trc20_checkout(jsonb, jsonb) from public;
grant execute on function public.create_usdt_trc20_checkout(jsonb, jsonb) to authenticated;

revoke all on function public.request_wallet_deposit(public.wallet_currency, numeric, text, text) from public;
grant execute on function public.request_wallet_deposit(public.wallet_currency, numeric, text, text) to authenticated;

revoke all on function public.request_wallet_withdrawal(public.wallet_currency, numeric, text, text) from public;
grant execute on function public.request_wallet_withdrawal(public.wallet_currency, numeric, text, text) to authenticated;

revoke all on function public.review_wallet_transaction(uuid, boolean, text) from public;
grant execute on function public.review_wallet_transaction(uuid, boolean, text) to authenticated;

revoke all on function public.charge_all_dropship_inventory_fees(date, public.dropship_fee_charge_trigger, text) from public;
grant execute on function public.charge_all_dropship_inventory_fees(date, public.dropship_fee_charge_trigger, text)
  to authenticated, service_role;

revoke all on function public.get_platform_treasury_user_id() from public;

revoke all on function public.sync_order_fulfillment(
  uuid, public.order_status, text, text, text, text, public.fulfillment_sync_source, jsonb, text
) from public;
grant execute on function public.sync_order_fulfillment(
  uuid, public.order_status, text, text, text, text, public.fulfillment_sync_source, jsonb, text
) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 10) Fee charge-all: do not double-count already-paid invoices
-- ---------------------------------------------------------------------------

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
    where coalesce(p.is_dropship, false) = true
      and p.status = 'active'
      and v.status = 'approved'
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
    'trigger_source', v_source
  );
end;
$$;

revoke all on function public.charge_all_dropship_inventory_fees(date, public.dropship_fee_charge_trigger, text) from public;
grant execute on function public.charge_all_dropship_inventory_fees(date, public.dropship_fee_charge_trigger, text)
  to authenticated, service_role;

comment on function public.protect_vendor_privileged_columns() is
  'Locks vendor status/commission_rate/owner_id for non-admins (INSERT+UPDATE).';

-- ---------------------------------------------------------------------------
-- 11) Dropship listing price floor on product UPDATE (not only import RPC)
-- ---------------------------------------------------------------------------

create or replace function public.protect_dropship_listing_price()
returns trigger
language plpgsql
as $$
declare
  v_source_price numeric(12, 2);
begin
  if coalesce(new.is_dropship, false)
     and new.source_product_id is not null
     and not public.is_admin() then
    select price into v_source_price
    from public.products
    where id = new.source_product_id;

    if found and new.price < v_source_price then
      raise exception
        'Listing price % USDT cannot be below supplier price % USDT',
        new.price,
        v_source_price;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists products_protect_dropship_listing_price on public.products;
create trigger products_protect_dropship_listing_price
  before insert or update of price, is_dropship, source_product_id on public.products
  for each row execute function public.protect_dropship_listing_price();
