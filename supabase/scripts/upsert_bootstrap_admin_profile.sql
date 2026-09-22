-- =============================================================================
-- Clean upsert: pyaephyonaing.pol@gmail.com → public.profiles (role = admin)
--
-- Columns used ONLY: id, email, full_name, role
-- (Compatible with minimal profiles schemas that lack avatar_url / timestamps.)
--
-- Run in: Supabase Dashboard → SQL Editor → Run
-- Prerequisite: the email already exists in Authentication → Users (auth.users)
-- =============================================================================

-- Let this session change roles without an existing admin session.
create or replace function public.protect_profile_role()
returns trigger
language plpgsql
as $$
begin
  if nullif(current_setting('app.bypass_profile_role_protect', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.role is distinct from old.role
     and not public.is_admin() then
    raise exception 'Only admins can change roles';
  end if;
  return new;
end;
$$;

do $$
declare
  target_email constant text := 'pyaephyonaing.pol@gmail.com';
  auth_id uuid;
  auth_email text;
  auth_full_name text;
begin
  perform set_config('app.bypass_profile_role_protect', 'on', true);

  select u.id, u.email,
         coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name')
    into auth_id, auth_email, auth_full_name
  from auth.users u
  where lower(trim(u.email)) = target_email
  order by u.created_at asc
  limit 1;

  if auth_id is null then
    raise exception
      'No auth.users row for %. Create/sign up that user first, then re-run this script.',
      target_email;
  end if;

  -- Prefer update when the row already exists (by id OR email).
  update public.profiles
  set
    email = coalesce(auth_email, target_email),
    full_name = coalesce(auth_full_name, full_name),
    role = 'admin'
  where id = auth_id
     or lower(trim(email)) = target_email;

  if found then
    raise notice 'Updated existing profile to admin for % (id=%)', target_email, auth_id;
  else
    insert into public.profiles (id, email, full_name, role)
    values (
      auth_id,
      coalesce(auth_email, target_email),
      auth_full_name,
      'admin'
    );
    raise notice 'Inserted admin profile for % (id=%)', target_email, auth_id;
  end if;
end;
$$;

-- Verify
select id, email, full_name, role
from public.profiles
where lower(trim(email)) = 'pyaephyonaing.pol@gmail.com'
   or id in (
     select id from auth.users
     where lower(trim(email)) = 'pyaephyonaing.pol@gmail.com'
   );
