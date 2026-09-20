-- =============================================================================
-- ensure_products_compare_at_price.sql
--
-- Paste-ready: add public.products.compare_at_price if missing and reload
-- PostgREST schema cache (fixes import "column not in schema cache" errors).
-- =============================================================================

alter table public.products
  add column if not exists compare_at_price numeric(12, 2);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_compare_at_price_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_compare_at_price_check
      check (compare_at_price is null or compare_at_price >= 0);
  end if;
end;
$$;

comment on column public.products.compare_at_price is
  'Optional list / compare-at price shown as strikethrough on the storefront.';

notify pgrst, 'reload schema';
