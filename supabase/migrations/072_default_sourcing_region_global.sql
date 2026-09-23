-- Default CJ / marketplace sourcing region is GLOBAL (worldwide), not Myanmar.
-- Keeps country-specific regions available; only flips which one is is_default.

update public.sourcing_regions
set is_default = false,
    updated_at = now()
where is_default = true
  and code is distinct from 'GLOBAL';

insert into public.sourcing_regions (code, name, country_codes, is_default, sort_order)
values (
  'GLOBAL',
  'Rest of world',
  array[]::text[],
  true,
  100
)
on conflict (code) do update
set
  name = excluded.name,
  is_default = true,
  is_active = true,
  updated_at = now();

-- Exactly one default region.
update public.sourcing_regions
set is_default = (code = 'GLOBAL'),
    updated_at = now();
