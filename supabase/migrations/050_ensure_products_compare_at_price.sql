-- =============================================================================
-- 050_ensure_products_compare_at_price.sql
--
-- Live DBs that created `products` without the full initial schema are missing
-- compare_at_price. PostgREST then rejects inserts with:
--   Could not find the 'compare_at_price' column of 'products' in the schema cache
--
-- Idempotently add the column + check constraint, then reload the schema cache.
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

-- Reload PostgREST schema cache so the column is visible immediately.
notify pgrst, 'reload schema';
