-- Fix: vendor apply fails with "column v.owner_id does not exist"
-- when live public.vendors uses user_id instead of owner_id.
--
-- 1) Normalize column name to owner_id (rename user_id if needed)
-- 2) Recreate apply_for_vendor / owns_vendor / review_vendor to use owner_id

do $$
begin
  -- Case A: only user_id exists → rename to owner_id
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'vendors'
      and column_name = 'user_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'vendors'
      and column_name = 'owner_id'
  ) then
    alter table public.vendors rename column user_id to owner_id;
    raise notice 'Renamed vendors.user_id → vendors.owner_id';
  end if;

  -- Case B: neither exists → add owner_id
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'vendors'
      and column_name = 'owner_id'
  ) then
    alter table public.vendors
      add column owner_id uuid references public.profiles (id) on delete restrict;
    raise notice 'Added vendors.owner_id';
  end if;

  -- Case C: both exist → copy user_id into null owner_id, then drop user_id if safe
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'vendors'
      and column_name = 'user_id'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'vendors'
      and column_name = 'owner_id'
  ) then
    execute 'update public.vendors set owner_id = user_id where owner_id is null';
  end if;
end;
$$;

create unique index if not exists vendors_owner_id_key on public.vendors (owner_id);

create or replace function public.owns_vendor(p_vendor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.vendors v
    where v.id = p_vendor_id
      and v.owner_id = auth.uid()
  );
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

  if exists (
    select 1 from public.vendors v where v.owner_id = v_user_id
  ) then
    raise exception 'You already have a vendor application';
  end if;

  if exists (
    select 1 from public.vendors v where v.slug = v_slug
  ) then
    raise exception 'That store URL is already taken';
  end if;

  insert into public.vendors (owner_id, name, slug, description, status)
  values (v_user_id, p_name, v_slug, p_description, 'pending')
  returning id into v_vendor_id;

  -- Promote customer → vendor (bypass role protect flags used across migrations)
  begin
    perform set_config('app.bypass_role_protect', 'true', true);
  exception when others then
    null;
  end;
  begin
    perform set_config('app.bypass_profile_role_protect', 'on', true);
  exception when others then
    null;
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

create or replace function public.review_vendor(
  p_vendor_id uuid,
  p_status public.vendor_status
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can review vendors';
  end if;

  if p_status not in ('approved', 'rejected', 'suspended') then
    raise exception 'Invalid review status';
  end if;

  update public.vendors
  set status = p_status
  where id = p_vendor_id;

  if not found then
    raise exception 'Vendor not found';
  end if;

  if p_status = 'approved' then
    update public.profiles p
    set role = 'vendor'
    from public.vendors v
    where v.id = p_vendor_id
      and p.id = v.owner_id
      and p.role = 'customer';
  end if;
end;
$$;

revoke all on function public.review_vendor(uuid, public.vendor_status) from public;
grant execute on function public.review_vendor(uuid, public.vendor_status) to authenticated;
