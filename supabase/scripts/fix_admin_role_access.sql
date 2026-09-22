-- Paste into Supabase SQL Editor if /admin/dashboard still says Access denied
-- after the profile role is admin. Creates get_my_role() used by app middleware.

create or replace function public.get_my_role()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_role text;
begin
  if v_uid is null then
    return null;
  end if;

  select lower(trim(p.role::text)) into v_role
  from public.profiles p
  where p.id = v_uid
  limit 1;

  if v_role is not null and v_role <> '' then
    return v_role;
  end if;

  select lower(trim(u.email)) into v_email
  from auth.users u
  where u.id = v_uid;

  if v_email is null or v_email = '' then
    return null;
  end if;

  select lower(trim(p.role::text)) into v_role
  from public.profiles p
  where lower(trim(p.email)) = v_email
  limit 1;

  if v_role is not null and v_role <> '' then
    return v_role;
  end if;

  if v_email = 'pyaephyonaing.pol@gmail.com' then
    return 'admin';
  end if;

  return null;
end;
$$;

revoke all on function public.get_my_role() from public;
grant execute on function public.get_my_role() to authenticated;
grant execute on function public.get_my_role() to anon;

-- Quick check while signed in via SQL editor won't have auth.uid().
-- Verify profile id matches auth user id instead:
select
  u.id as auth_id,
  u.email as auth_email,
  p.id as profile_id,
  p.email as profile_email,
  p.role as profile_role,
  (p.id = u.id) as ids_match
from auth.users u
left join public.profiles p
  on lower(trim(p.email)) = lower(trim(u.email))
  or p.id = u.id
where lower(trim(u.email)) = 'pyaephyonaing.pol@gmail.com';
