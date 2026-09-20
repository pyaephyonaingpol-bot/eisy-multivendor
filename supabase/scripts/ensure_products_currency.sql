-- =============================================================================
-- ensure_products_currency.sql
--
-- Paste-ready: add public.products.currency (USDT) if missing and reload
-- PostgREST schema cache (fixes import "column not in schema cache" errors).
-- =============================================================================

alter table public.products
  add column if not exists currency text not null default 'USDT';

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

notify pgrst, 'reload schema';
