-- =============================================================================
-- 053_ensure_products_currency.sql
--
-- Live DBs that created `products` without the full initial schema are missing
-- currency. PostgREST then rejects inserts with:
--   Could not find the 'currency' column of 'products' in the schema cache
--
-- Idempotently add the column (USDT settlement), USDT-only check, then reload
-- the PostgREST schema cache.
-- =============================================================================

alter table public.products
  add column if not exists currency text not null default 'USDT';

-- Heal any pre-existing non-USDT values before enforcing the check.
update public.products
set currency = 'USDT'
where currency is distinct from 'USDT';

alter table public.products
  alter column currency set default 'USDT';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_currency_usdt_only'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_currency_usdt_only
      check (currency = 'USDT');
  end if;
end;
$$;

comment on column public.products.currency is
  'Marketplace settlement currency. Always USDT.';

-- Reload PostgREST schema cache so the column is visible immediately.
notify pgrst, 'reload schema';
