-- Paste-ready: fix vendors.owner_id / apply_for_vendor
-- Run in Supabase SQL Editor if vendor apply fails with:
--   column v.owner_id does not exist

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vendors' and column_name = 'user_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vendors' and column_name = 'owner_id'
  ) then
    alter table public.vendors rename column user_id to owner_id;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vendors' and column_name = 'owner_id'
  ) then
    alter table public.vendors
      add column owner_id uuid references public.profiles (id) on delete restrict;
  end if;
end;
$$;

create unique index if not exists vendors_owner_id_key on public.vendors (owner_id);

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
  v_vendor_id uuid;
  v_slug text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  p_name := nullif(trim(p_name), '');
  v_slug := lower(trim(p_slug));
  p_description := nullif(trim(p_description), '');

  if p_name is null then
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

  insert into public.vendors (owner_id, name, slug, description, status)
  values (v_user_id, p_name, v_slug, p_description, 'pending')
  returning id into v_vendor_id;

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

grant execute on function public.apply_for_vendor(text, text, text) to authenticated;

-- Verify column exists
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'vendors'
  and column_name in ('owner_id', 'user_id')
order by column_name;
