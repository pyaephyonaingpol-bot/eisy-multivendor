-- Idempotent: make GLOBAL the default sourcing region for CJ / marketplace.
-- Safe to re-run in Supabase SQL editor.

update public.sourcing_regions
set is_default = (code = 'GLOBAL'),
    updated_at = now()
where exists (
  select 1 from public.sourcing_regions where code = 'GLOBAL'
);
