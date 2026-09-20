-- Clean migration: upsert bootstrap admin using only id, email, full_name, role.
-- Paste-ready twin: supabase/scripts/upsert_bootstrap_admin_profile.sql

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
    raise notice
      'No auth.users row for %. Sign up first, then re-run supabase/scripts/upsert_bootstrap_admin_profile.sql',
      target_email;
    return;
  end if;

  update public.profiles
  set
    email = coalesce(auth_email, target_email),
    full_name = coalesce(auth_full_name, full_name),
    role = 'admin'
  where id = auth_id
     or lower(trim(email)) = target_email;

  if not found then
    insert into public.profiles (id, email, full_name, role)
    values (
      auth_id,
      coalesce(auth_email, target_email),
      auth_full_name,
      'admin'
    );
  end if;
end;
$$;
