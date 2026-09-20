-- =============================================================================
-- 041_vendors_store_name_not_null_default.sql
--
-- Live DB: store_name is NOT NULL without a usable default, so inserts that
-- omit it fail. Ensure column exists, backfill, and default to name-like value.
-- Also recreate apply_for_vendor to always set store_name.
-- =============================================================================

alter table public.vendors
  add column if not exists store_name text;

update public.vendors
set store_name = coalesce(nullif(trim(store_name), ''), nullif(trim(name), ''), 'Store')
where store_name is null or trim(store_name) = '';

alter table public.vendors
  alter column store_name set default '';

do $$
begin
  alter table public.vendors alter column store_name set not null;
exception when others then
  raise notice 'Could not set store_name NOT NULL: %', sqlerrm;
end;
$$;

create or replace function public.apply_for_vendor(
  p_name text,
  p_slug text,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_vendor_id uuid := gen_random_uuid();
  v_slug text;
  v_name text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (select 1 from public.profiles p where p.id = v_user_id) then
    raise exception
      'No profile for this account. Create public.profiles for your user first, then re-apply.';
  end if;

  v_name := nullif(trim(p_name), '');
  v_slug := lower(trim(p_slug));
  p_description := nullif(trim(p_description), '');

  if v_name is null then
    raise exception 'Store name is required';
  end if;

  if v_slug is null or v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'Slug must be lowercase letters, numbers, and hyphens';
  end if;

  if exists (select 1 from public.vendors v where v.owner_id = v_user_id) then
    raise exception 'You already have a vendor application';
  end if;

  if exists (select 1 from public.vendors v where v.slug = v_slug) then
    raise exception 'That store URL is already taken';
  end if;

  insert into public.vendors (
    id, owner_id, name, store_name, slug, description, status
  )
  values (
    v_vendor_id, v_user_id, v_name, v_name, v_slug, p_description, 'pending'
  );

  begin
    perform set_config('app.bypass_role_protect', 'true', true);
  exception when others then null;
  end;
  begin
    perform set_config('app.bypass_profile_role_protect', 'on', true);
  exception when others then null;
  end;

  update public.profiles
  set role = 'vendor'
  where id = v_user_id
    and role = 'customer';

  return v_vendor_id;
end;
$$;

revoke all on function public.apply_for_vendor(text, text, text) from public;
grant execute on function public.apply_for_vendor(text, text, text) to authenticated;
