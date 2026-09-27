-- Multi-region shipping buffers + order market metadata.
-- Buffered markets (AE, PH, MM): buffer baked into buyer-facing price → Free Shipping.
-- Global: no buffer in base price → live / calculated shipping at checkout.

create table if not exists public.shipping_buffers (
  id uuid primary key default gen_random_uuid(),
  country_code text not null,
  min_weight_g numeric(12, 2) not null default 0,
  max_weight_g numeric(12, 2) not null,
  buffer_amount_usd numeric(18, 6) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shipping_buffers_country_upper
    check (country_code = upper(country_code)),
  constraint shipping_buffers_weight_range
    check (min_weight_g >= 0 and max_weight_g > min_weight_g),
  constraint shipping_buffers_amount_nonneg
    check (buffer_amount_usd >= 0),
  constraint shipping_buffers_unique_bracket
    unique (country_code, min_weight_g, max_weight_g)
);

create index if not exists shipping_buffers_country_idx
  on public.shipping_buffers (country_code);

alter table public.products
  add column if not exists weight_grams numeric(12, 2);

alter table public.orders
  add column if not exists shipping_type text;

alter table public.orders
  add column if not exists display_currency text;

alter table public.orders
  add column if not exists target_market text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_shipping_type_check'
  ) then
    alter table public.orders
      add constraint orders_shipping_type_check
      check (
        shipping_type is null
        or shipping_type in ('included', 'plus_shipping')
      );
  end if;
end $$;

-- Seed weight-bracket buffers (USD / USDT). Idempotent.
insert into public.shipping_buffers (
  country_code, min_weight_g, max_weight_g, buffer_amount_usd
)
values
  -- UAE
  ('AE', 0, 250, 2.20),
  ('AE', 250, 500, 3.10),
  ('AE', 500, 1000, 4.50),
  ('AE', 1000, 2000, 6.80),
  ('AE', 2000, 5000, 11.00),
  ('AE', 5000, 100000, 18.00),
  -- Philippines
  ('PH', 0, 250, 1.80),
  ('PH', 250, 500, 2.60),
  ('PH', 500, 1000, 3.90),
  ('PH', 1000, 2000, 5.80),
  ('PH', 2000, 5000, 9.50),
  ('PH', 5000, 100000, 15.00),
  -- Myanmar
  ('MM', 0, 250, 1.50),
  ('MM', 250, 500, 2.20),
  ('MM', 500, 1000, 3.40),
  ('MM', 1000, 2000, 5.20),
  ('MM', 2000, 5000, 8.50),
  ('MM', 5000, 100000, 14.00)
on conflict (country_code, min_weight_g, max_weight_g) do update
set
  buffer_amount_usd = excluded.buffer_amount_usd,
  updated_at = now();

create or replace function public.is_buffered_shipping_market(p_country text)
returns boolean
language sql
immutable
as $$
  select upper(nullif(trim(coalesce(p_country, '')), '')) in ('AE', 'PH', 'MM');
$$;

create or replace function public.lookup_shipping_buffer_usd(
  p_country text,
  p_weight_g numeric default 300
)
returns numeric
language plpgsql
stable
as $$
declare
  v_country text := upper(nullif(trim(coalesce(p_country, '')), ''));
  v_weight numeric := greatest(0, coalesce(p_weight_g, 300));
  v_amount numeric;
begin
  if v_country is null or not public.is_buffered_shipping_market(v_country) then
    return 0;
  end if;

  select buffer_amount_usd
  into v_amount
  from public.shipping_buffers
  where country_code = v_country
    and v_weight >= min_weight_g
    and v_weight < max_weight_g
  order by min_weight_g asc
  limit 1;

  if v_amount is null then
    select buffer_amount_usd
    into v_amount
    from public.shipping_buffers
    where country_code = v_country
    order by max_weight_g desc
    limit 1;
  end if;

  return round(coalesce(v_amount, 0), 6);
end;
$$;

create or replace function public.display_currency_for_market(p_country text)
returns text
language sql
immutable
as $$
  select case upper(nullif(trim(coalesce(p_country, '')), ''))
    when 'AE' then 'AED'
    when 'PH' then 'PHP'
    when 'MM' then 'USD'
    else 'USDT'
  end;
$$;

create or replace function public.target_market_for_country(p_country text)
returns text
language sql
immutable
as $$
  select case
    when public.is_buffered_shipping_market(p_country) then
      upper(nullif(trim(coalesce(p_country, '')), ''))
    else 'GLOBAL'
  end;
$$;

/**
 * After wallet/TRC20 checkout creates orders, apply region shipping settlement:
 * - AE/PH/MM: add per-line shipping buffers into order totals, shipping_fee = 0, type=included
 * - GLOBAL: set shipping_fee from live CJ quote (p_live_shipping_fee), type=plus_shipping
 * Debits the buyer's USDT wallet for any added amount (wallet checkouts),
 * or bumps the open TRC20 payment intent amount.
 */
create or replace function public.apply_region_shipping_settlement(
  p_order_ids uuid[],
  p_country_code text,
  p_live_shipping_fee numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_country text := upper(nullif(trim(coalesce(p_country_code, '')), ''));
  v_market text;
  v_display_currency text;
  v_shipping_type text;
  v_order public.orders%rowtype;
  v_item record;
  v_buffer numeric(18, 6);
  v_weight numeric;
  v_extra_total numeric(18, 6) := 0;
  v_order_extra numeric(18, 6);
  v_live numeric(18, 6) := greatest(0, coalesce(p_live_shipping_fee, 0));
  v_wallet public.wallets%rowtype;
  v_intent public.usdt_payment_intents%rowtype;
  v_orders_updated int := 0;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if v_country is null then
    v_country := 'MM';
  end if;

  if p_order_ids is null or cardinality(p_order_ids) = 0 then
    raise exception 'No orders to settle';
  end if;

  v_market := public.target_market_for_country(v_country);
  v_display_currency := public.display_currency_for_market(v_country);
  v_shipping_type := case
    when v_market = 'GLOBAL' then 'plus_shipping'
    else 'included'
  end;

  for v_order in
    select * from public.orders
    where id = any(p_order_ids)
      and customer_id = v_user_id
    for update
  loop
    v_order_extra := 0;

    if v_market <> 'GLOBAL' then
      for v_item in
        select oi.*, p.weight_grams, p.specifications
        from public.order_items oi
        left join public.products p on p.id = oi.product_id
        where oi.order_id = v_order.id
      loop
        v_weight := coalesce(v_item.weight_grams, 300);
        v_buffer := public.lookup_shipping_buffer_usd(v_country, v_weight);
        if v_buffer > 0 then
          v_order_extra := v_order_extra + round(v_buffer * v_item.quantity, 6);
          update public.order_items
          set
            unit_price = unit_price + v_buffer,
            line_total = round((unit_price + v_buffer) * quantity, 6),
            shipping_cost_usdt = 0
          where id = v_item.id;
        end if;
      end loop;

      update public.orders
      set
        subtotal = subtotal + v_order_extra,
        shipping_fee = 0,
        total = total + v_order_extra,
        shipping_type = v_shipping_type,
        display_currency = v_display_currency,
        target_market = v_market,
        buyer_country_code = v_country,
        updated_at = now()
      where id = v_order.id;

      v_extra_total := v_extra_total + v_order_extra;
    else
      -- Split live fee across orders proportionally by current total.
      -- Applied once after the loop using first-order assignment when single order;
      -- multi-vendor carts get proportional split below.
      null;
    end if;

    v_orders_updated := v_orders_updated + 1;
  end loop;

  if v_market = 'GLOBAL' and v_live > 0 then
    -- Put the full live shipping fee on the first order (typical single-vendor cart);
    -- remaining orders keep shipping_fee=0 metadata.
    update public.orders o
    set
      shipping_fee = case
        when o.id = p_order_ids[1] then v_live
        else 0
      end,
      total = total + case
        when o.id = p_order_ids[1] then v_live
        else 0
      end,
      shipping_type = 'plus_shipping',
      display_currency = 'USDT',
      target_market = 'GLOBAL',
      buyer_country_code = v_country,
      updated_at = now()
    where o.id = any(p_order_ids)
      and o.customer_id = v_user_id;

    v_extra_total := v_extra_total + v_live;
  else
    -- Ensure metadata is set even when buffer/extra is zero.
    update public.orders
    set
      shipping_type = coalesce(shipping_type, v_shipping_type),
      display_currency = coalesce(display_currency, v_display_currency),
      target_market = coalesce(target_market, v_market),
      buyer_country_code = coalesce(buyer_country_code, v_country),
      updated_at = now()
    where id = any(p_order_ids)
      and customer_id = v_user_id;
  end if;

  if v_extra_total > 0 then
    -- Wallet checkout: debit the delta. TRC20: bump open intent amount.
    select * into v_intent
    from public.usdt_payment_intents
    where user_id = v_user_id
      and status = 'pending'
      and order_ids && p_order_ids
    order by created_at desc
    limit 1;

    if found then
      update public.usdt_payment_intents
      set
        amount_usdt = amount_usdt + v_extra_total,
        updated_at = now()
      where id = v_intent.id;
    else
      select * into v_wallet
      from public.wallets
      where user_id = v_user_id and currency = 'USDT'
      for update;

      if not found then
        raise exception 'USDT wallet not found';
      end if;

      if v_wallet.available_balance < v_extra_total then
        raise exception 'Insufficient USDT balance for region shipping settlement.';
      end if;

      update public.wallets
      set available_balance = available_balance - v_extra_total
      where id = v_wallet.id;

      insert into public.wallet_transactions (
        wallet_id, user_id, currency, tx_type, status, amount, reference, note
      ) values (
        v_wallet.id,
        v_user_id,
        'USDT',
        'purchase',
        'completed',
        v_extra_total,
        'region_shipping',
        case
          when v_market = 'GLOBAL' then 'Live shipping fee (plus shipping)'
          else 'Included shipping buffer (' || v_market || ')'
        end
      );
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'target_market', v_market,
    'shipping_type', v_shipping_type,
    'display_currency', v_display_currency,
    'extra_usdt', v_extra_total,
    'orders_updated', v_orders_updated
  );
end;
$$;

grant execute on function public.is_buffered_shipping_market(text) to authenticated, anon;
grant execute on function public.lookup_shipping_buffer_usd(text, numeric) to authenticated, anon;
grant execute on function public.display_currency_for_market(text) to authenticated, anon;
grant execute on function public.target_market_for_country(text) to authenticated, anon;
grant execute on function public.apply_region_shipping_settlement(uuid[], text, numeric) to authenticated;

alter table public.shipping_buffers enable row level security;

drop policy if exists shipping_buffers_read on public.shipping_buffers;
create policy shipping_buffers_read
  on public.shipping_buffers
  for select
  to authenticated, anon
  using (true);
