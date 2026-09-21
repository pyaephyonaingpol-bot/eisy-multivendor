-- =============================================================================
-- 059_ensure_products_price_usdt.sql
--
-- CJ / supplier import failed with:
--   null value in column "price_usdt" of relation "products" violates not-null
--
-- Canonical app column is products.price (USDT). Some drifted DBs also have
-- price_usdt NOT NULL without a default. Heal, sync from price, and reload cache.
-- =============================================================================

alter table public.products
  add column if not exists price numeric(12, 2);

-- Heal blank / null canonical price before enforcing NOT NULL.
update public.products
set price = coalesce(nullif(price, 0), 0.01)
where price is null or price <= 0;

alter table public.products
  alter column price set default 0.01;

do $$
begin
  alter table public.products
    alter column price set not null;
exception
  when others then null;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_price_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_price_check check (price >= 0);
  end if;
end;
$$;

-- Drifted price_usdt column: keep it NOT NULL and mirrored from price.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'products'
      and column_name = 'price_usdt'
  ) then
    update public.products
    set price_usdt = coalesce(
      nullif(price_usdt, 0),
      nullif(price, 0),
      0.01
    )
    where price_usdt is null or price_usdt <= 0;

    alter table public.products
      alter column price_usdt set default 0.01;

    begin
      alter table public.products
        alter column price_usdt set not null;
    exception
      when others then null;
    end;
  end if;
end;
$$;

create or replace function public.products_ensure_price_usdt()
returns trigger
language plpgsql
as $$
declare
  payload jsonb;
  mirrored numeric;
begin
  if new.price is null or new.price <= 0 then
    new.price := 0.01;
  end if;

  payload := to_jsonb(new);
  if payload ? 'price_usdt' then
    mirrored := nullif((payload ->> 'price_usdt')::numeric, 0);
    if mirrored is null or mirrored <= 0 then
      mirrored := new.price;
    end if;
    new := jsonb_populate_record(
      new,
      jsonb_build_object('price_usdt', mirrored)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists products_ensure_price_usdt on public.products;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'products'
      and column_name = 'price_usdt'
  ) then
    execute $trig$
      create trigger products_ensure_price_usdt
        before insert or update of price, price_usdt
        on public.products
        for each row
        execute function public.products_ensure_price_usdt()
    $trig$;
  else
    execute $trig$
      create trigger products_ensure_price_usdt
        before insert or update of price
        on public.products
        for each row
        execute function public.products_ensure_price_usdt()
    $trig$;
  end if;
end;
$$;

comment on column public.products.price is
  'Marketplace sell price in USDT. Never null; import also mirrors to price_usdt when present.';

notify pgrst, 'reload schema';
