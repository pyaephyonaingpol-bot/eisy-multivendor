-- Flexible product specifications as an ordered JSON array of {key, value} objects.
-- Example: [{"key":"Color","value":"Black"},{"key":"Storage","value":"256 GB"}]

alter table public.products
  add column if not exists specifications jsonb not null default '[]'::jsonb;

comment on column public.products.specifications is
  'Ordered list of product attribute key/value pairs for the storefront specs table';

-- Ensure the column is always a JSON array (not an object or scalar).
do $$
begin
  alter table public.products
    add constraint products_specifications_is_array
    check (jsonb_typeof(specifications) = 'array');
exception
  when duplicate_object then null;
end $$;
