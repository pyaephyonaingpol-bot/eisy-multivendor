-- Dropship import: copy marketplace products into a vendor catalog with custom
-- pricing, and route checkout fulfillment + stock to the original supplier.

-- ---------------------------------------------------------------------------
-- products: dropship listing metadata
-- ---------------------------------------------------------------------------

alter table public.products
  add column if not exists source_product_id uuid references public.products (id) on delete set null,
  add column if not exists is_dropship boolean not null default false;

comment on column public.products.source_product_id is
  'Original supplier product this listing was imported from (dropship only).';
comment on column public.products.is_dropship is
  'True when this row is a dropshipper listing that fulfills from source_product_id.';

create unique index if not exists products_vendor_source_product_uidx
  on public.products (vendor_id, source_product_id)
  where source_product_id is not null;

create index if not exists products_source_product_id_idx
  on public.products (source_product_id)
  where source_product_id is not null;

create index if not exists products_is_dropship_idx
  on public.products (is_dropship)
  where is_dropship = true;

-- Dropship listings never hold their own physical inventory.
create or replace function public.normalize_product_inventory()
returns trigger
language plpgsql
as $$
begin
  if coalesce(new.is_dropship, false) then
    new.stock_quantity := 0;
  end if;

  if new.product_type = 'digital' then
    new.stock_quantity := 0;
    new.download_url := nullif(trim(new.download_url), '');
    new.download_label := nullif(trim(new.download_label), '');
  else
    new.download_url := null;
    new.download_label := null;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- orders / order_items: seller vs fulfillment + cost basis
-- ---------------------------------------------------------------------------

alter table public.orders
  add column if not exists seller_vendor_id uuid references public.vendors (id) on delete restrict;

comment on column public.orders.vendor_id is
  'Fulfillment vendor (supplier). For direct sales this is also the seller.';
comment on column public.orders.seller_vendor_id is
  'Store that sold the items (dropshipper). Equals vendor_id for direct sales.';

update public.orders
set seller_vendor_id = vendor_id
where seller_vendor_id is null;

alter table public.orders
  alter column seller_vendor_id set not null;

create index if not exists orders_seller_vendor_id_idx
  on public.orders (seller_vendor_id);

alter table public.order_items
  add column if not exists listing_product_id uuid references public.products (id) on delete set null,
  add column if not exists source_product_id uuid references public.products (id) on delete set null,
  add column if not exists cost_unit_price numeric(12, 2);

comment on column public.order_items.product_id is
  'Listing product purchased by the customer (dropship listing or direct).';
comment on column public.order_items.listing_product_id is
  'Same as product_id for dropship-aware checkouts (explicit listing reference).';
comment on column public.order_items.source_product_id is
  'Supplier SKU used for stock decrement and fulfillment.';
comment on column public.order_items.cost_unit_price is
  'Amount credited to the supplier per unit; listing unit_price is what the buyer paid.';

-- Allow dropship sellers to read orders they sold (even when fulfillment vendor differs).
drop policy if exists "orders_select_customer_vendor_or_admin" on public.orders;
create policy "orders_select_customer_vendor_or_admin"
  on public.orders for select
  using (
    customer_id = auth.uid()
    or public.owns_vendor(vendor_id)
    or public.owns_vendor(seller_vendor_id)
    or public.is_admin()
  );

drop policy if exists "orders_update_customer_vendor_or_admin" on public.orders;
create policy "orders_update_customer_vendor_or_admin"
  on public.orders for update
  using (
    customer_id = auth.uid()
    or public.owns_vendor(vendor_id)
    or public.owns_vendor(seller_vendor_id)
    or public.is_admin()
  );

-- ---------------------------------------------------------------------------
-- import_dropship_product — 1-click / extension import with custom price
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

grant execute on function public.import_dropship_product(uuid, numeric, public.product_status) to authenticated;

comment on function public.import_dropship_product(uuid, numeric, public.product_status) is
  'Import (or re-price) a supplier catalog product into the caller''s vendor store as a dropship listing.';

-- ---------------------------------------------------------------------------
-- checkout_with_usdt — route dropship sales to supplier + split wallet credits
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
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Cart is empty';
  end if;

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
    product_type text not null
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
      product_type
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
      coalesce(v_fulfill.product_type, 'physical')
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

  for v_group in
    select
      fulfillment_vendor_id,
      seller_vendor_id,
      max(supplier_owner_id) as supplier_owner_id,
      max(seller_owner_id) as seller_owner_id,
      sum(line_total) as listing_subtotal,
      sum(cost_line_total) as supplier_subtotal,
      sum(greatest(margin_line_total, 0)) as seller_margin
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
      shipping_address
    )
    values (
      v_user_id,
      v_group.fulfillment_vendor_id,
      v_group.seller_vendor_id,
      'paid',
      'paid',
      v_listing_subtotal,
      0,
      0,
      v_listing_subtotal,
      'USDT',
      v_shipping
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
      total_price
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
      line_total
    from tmp_checkout_lines
    where fulfillment_vendor_id = v_group.fulfillment_vendor_id
      and seller_vendor_id = v_group.seller_vendor_id;

    -- Supplier / fulfillment credit (source catalog price).
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

    -- Dropshipper margin (listing price − supplier price), when seller ≠ supplier.
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

  -- Always decrement supplier / source stock for physical goods.
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
    'wallet_transaction_id', v_tx_id
  );
end;
$$;

grant execute on function public.checkout_with_usdt(jsonb, jsonb) to authenticated;

comment on function public.checkout_with_usdt(jsonb, jsonb) is
  'Pay cart with USDT wallet: creates paid orders routed to suppliers for dropship, debits buyer, credits supplier + dropshipper margin.';
