-- Vendor onboarding helpers:
-- 1) Prevent owners from self-approving (status changes are admin-only)
-- 2) apply_for_vendor() — create pending store + promote profile to vendor
-- 3) review_vendor() — admin approve / reject / suspend
-- Safe to run after 001 (+ optional 002).

-- ---------------------------------------------------------------------------
-- One store application per owner (MVP)
-- ---------------------------------------------------------------------------

create unique index if not exists vendors_owner_id_key on public.vendors (owner_id);

-- ---------------------------------------------------------------------------
-- Owners may edit store details, but only admins may change status
-- ---------------------------------------------------------------------------

create or replace function public.protect_vendor_status()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status and not public.is_admin() then
    raise exception 'Only admins can change vendor status';
  end if;
  return new;
end;
$$;

drop trigger if exists vendors_protect_status on public.vendors;

create trigger vendors_protect_status
  before update on public.vendors
  for each row execute function public.protect_vendor_status();

-- ---------------------------------------------------------------------------
-- Allow role promotion customer → vendor only via apply_for_vendor bypass flag
-- ---------------------------------------------------------------------------

create or replace function public.protect_profile_role()
returns trigger
language plpgsql
as $$
begin
  if new.role is distinct from old.role then
    if public.is_admin() then
      return new;
    end if;

    if coalesce(current_setting('app.bypass_role_protect', true), 'false') = 'true'
       and old.role = 'customer'
       and new.role = 'vendor' then
      return new;
    end if;

    raise exception 'Only admins can change roles';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- apply_for_vendor — authenticated user submits a pending store application
-- ---------------------------------------------------------------------------

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

  -- Promote customer → vendor so they can access /vendor/* while pending.
  perform set_config('app.bypass_role_protect', 'true', true);

  update public.profiles
  set role = 'vendor'
  where id = v_user_id
    and role = 'customer';

  return v_vendor_id;
end;
$$;

revoke all on function public.apply_for_vendor(text, text, text) from public;
grant execute on function public.apply_for_vendor(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- review_vendor — admin sets approved | rejected | suspended
-- ---------------------------------------------------------------------------

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

  -- Keep the owner as vendor after approval; demote only if you add that later.
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
