-- Fix admin access checks: resolve role via security-definer RPC so middleware
-- is not blocked by RLS / mismatched profile ids.
-- Also repair bootstrap admin profile id when email matches but id differs.
-- Uses only id, email, full_name, role columns.

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

do $$
declare
  v_email constant text := 'pyaephyonaing.pol@gmail.com';
  v_auth_id uuid;
  v_auth_email text;
  v_full_name text;
  v_profile_id uuid;
begin
  begin
    perform set_config('app.bypass_profile_role_protect', 'on', true);
  exception
    when others then
      null;
  end;

  select u.id, u.email,
         coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name')
    into v_auth_id, v_auth_email, v_full_name
  from auth.users u
  where lower(trim(u.email)) = v_email
  order by u.created_at asc
  limit 1;

  if v_auth_id is null then
    raise notice 'get_my_role migration: no auth user for %', v_email;
    return;
  end if;

  select p.id into v_profile_id
  from public.profiles p
  where p.id = v_auth_id
  limit 1;

  if v_profile_id is null then
    select p.id into v_profile_id
    from public.profiles p
    where lower(trim(p.email)) = v_email
    limit 1;
  end if;

  if v_profile_id is null then
    insert into public.profiles (id, email, full_name, role)
    values (
      v_auth_id,
      coalesce(v_auth_email, v_email),
      v_full_name,
      'admin'
    );
    raise notice 'Created bootstrap admin profile for %', v_email;
    return;
  end if;

  if v_profile_id = v_auth_id then
    update public.profiles
    set
      role = 'admin',
      email = coalesce(nullif(email, ''), v_auth_email, v_email),
      full_name = coalesce(full_name, v_full_name)
    where id = v_auth_id;
    return;
  end if;

  -- Profile exists under email but wrong id — delete orphan and insert correct id.
  delete from public.profiles where id = v_profile_id;

  update public.profiles
  set
    role = 'admin',
    email = coalesce(v_auth_email, v_email),
    full_name = coalesce(v_full_name, full_name)
  where id = v_auth_id;

  if not found then
    insert into public.profiles (id, email, full_name, role)
    values (
      v_auth_id,
      coalesce(v_auth_email, v_email),
      v_full_name,
      'admin'
    );
  end if;

  raise notice 'Re-linked bootstrap admin profile to auth id %', v_auth_id;
exception
  when others then
    raise notice 'Bootstrap admin id repair skipped: %', sqlerrm;
end;
$$;
