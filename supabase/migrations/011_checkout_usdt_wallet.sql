-- Pay storefront carts with the buyer's USDT wallet balance.
-- Creates one paid order per vendor, debits buyer, credits vendor owners.

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
  v_product public.products%rowtype;
  v_vendor public.vendors%rowtype;
  v_buyer_wallet public.wallets%rowtype;
  v_vendor_wallet public.wallets%rowtype;
  v_order_id uuid;
  v_order_ids uuid[] := '{}';
  v_vendor_id uuid;
  v_owner_id uuid;
  v_vendor_subtotal numeric(18, 6);
  v_grand_total numeric(18, 6) := 0;
  v_tx_id uuid;
  v_shipping jsonb := case
    when p_shipping_address is null or p_shipping_address = 'null'::jsonb then null
    else p_shipping_address
  end;
  v_merged jsonb := '{}'::jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Cart is empty';
  end if;

  -- Merge duplicate product ids from the client payload.
  for v_item in select value from jsonb_array_elements(p_items) as t(value)
  loop
    v_product_id := nullif(v_item->>'product_id', '')::uuid;
    v_qty := nullif(trim(coalesce(v_item->>'quantity', '')), '')::integer;

    if v_product_id is null then
      raise exception 'Each cart item needs a product_id';
    end if;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Each cart item needs a quantity greater than zero';
    end if;

    if v_merged ? v_product_id::text then
      v_merged := jsonb_set(
        v_merged,
        array[v_product_id::text],
        to_jsonb((v_merged->>v_product_id::text)::integer + v_qty)
      );
    else
      v_merged := v_merged || jsonb_build_object(v_product_id::text, v_qty);
    end if;
  end loop;

  drop table if exists tmp_checkout_lines;
  create temporary table tmp_checkout_lines (
    product_id uuid primary key,
    vendor_id uuid not null,
    vendor_owner_id uuid not null,
    product_name text not null,
    quantity integer not null check (quantity > 0),
    unit_price numeric(18, 6) not null check (unit_price >= 0),
    line_total numeric(18, 6) not null check (line_total >= 0),
    product_type public.product_type not null
  ) on commit drop;

  for v_product_id, v_qty in
    select key::uuid, value::integer
    from jsonb_each_text(v_merged)
  loop
    select * into v_product
    from public.products
    where id = v_product_id
    for update;

    if not found then
      raise exception 'Product not found';
    end if;

    if v_product.status is distinct from 'active' then
      raise exception 'Product % is not available', v_product.name;
    end if;

    select * into v_vendor
    from public.vendors
    where id = v_product.vendor_id;

    if not found or v_vendor.status is distinct from 'approved' then
      raise exception 'Vendor for % is not approved', v_product.name;
    end if;

    if coalesce(v_product.product_type, 'physical') = 'physical'
       and v_product.stock_quantity < v_qty then
      raise exception 'Insufficient stock for %', v_product.name;
    end if;

    insert into tmp_checkout_lines (
      product_id,
      vendor_id,
      vendor_owner_id,
      product_name,
      quantity,
      unit_price,
      line_total,
      product_type
    )
    values (
      v_product.id,
      v_product.vendor_id,
      v_vendor.owner_id,
      v_product.name,
      v_qty,
      v_product.price,
      round(v_product.price * v_qty, 6),
      coalesce(v_product.product_type, 'physical')
    );
  end loop;

  select coalesce(sum(line_total), 0) into v_grand_total from tmp_checkout_lines;
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

  for v_vendor_id in
    select distinct vendor_id from tmp_checkout_lines order by vendor_id
  loop
    select sum(line_total), max(vendor_owner_id)
      into v_vendor_subtotal, v_owner_id
    from tmp_checkout_lines
    where vendor_id = v_vendor_id;

    insert into public.orders (
      customer_id,
      vendor_id,
      status,
      payment_status,
      subtotal,
      tax,
      shipping_fee,
      total,
      currency,
      shipping_address
    )
    values (
      v_user_id,
      v_vendor_id,
      'paid',
      'paid',
      v_vendor_subtotal,
      0,
      0,
      v_vendor_subtotal,
      'USDT',
      v_shipping
    )
    returning id into v_order_id;

    v_order_ids := array_append(v_order_ids, v_order_id);

    insert into public.order_items (
      order_id, product_id, product_name, quantity, unit_price, total_price
    )
    select
      v_order_id,
      product_id,
      product_name,
      quantity,
      unit_price,
      line_total
    from tmp_checkout_lines
    where vendor_id = v_vendor_id;

    perform public.ensure_user_wallets(v_owner_id);

    select * into v_vendor_wallet
    from public.wallets
    where user_id = v_owner_id and currency = 'USDT'
    for update;

    update public.wallets
    set available_balance = available_balance + v_vendor_subtotal
    where id = v_vendor_wallet.id;

    insert into public.wallet_transactions (
      wallet_id, user_id, currency, tx_type, status, amount, reference, note
    )
    values (
      v_vendor_wallet.id,
      v_owner_id,
      'USDT',
      'sale_credit',
      'completed',
      v_vendor_subtotal,
      v_order_id::text,
      'Sale credit from USDT checkout'
    );
  end loop;

  update public.products p
  set stock_quantity = p.stock_quantity - l.quantity
  from tmp_checkout_lines l
  where p.id = l.product_id
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
    'wallet_transaction_id', v_tx_id
  );
end;
$$;

grant execute on function public.checkout_with_usdt(jsonb, jsonb) to authenticated;

comment on function public.checkout_with_usdt(jsonb, jsonb) is
  'Pay cart with USDT wallet: creates paid orders, debits buyer, credits vendors.';
