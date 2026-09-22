-- =============================================================================
-- Fix auth.users ↔ public.profiles Sign up / Sign in linkage
--
-- Run in: Supabase Dashboard → SQL Editor → Run
-- Safe to re-run.
--
-- Fixes: handle_new_user inserting role='customer' / avatar_url into a drifted
-- profiles table (check only buyer|vendor|admin) which causes
-- "Database error creating/saving new user" and subsequent
-- "Invalid login credentials" confusion.
-- =============================================================================

do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'profiles'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%role%'
  loop
    execute format('alter table public.profiles drop constraint if exists %I', r.conname);
  end loop;
end;
$$;

alter table public.profiles
  add constraint profiles_role_check
  check (
    lower(role::text) in ('customer', 'buyer', 'vendor', 'admin')
  );

update public.profiles
set role = 'customer'
where lower(role::text) = 'buyer';

do $$
begin
  alter table public.profiles alter column role set default 'customer';
exception
  when others then
    null;
end;
$$;

alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists updated_at timestamptz;
alter table public.profiles add column if not exists preferred_region_id uuid;
alter table public.profiles add column if not exists preferred_country_code text;

update public.profiles
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

create or replace function public.map_signup_role(
  p_email text,
  p_requested text
)
returns text
language plpgsql
immutable
as $$
declare
  normalized_email text := lower(trim(coalesce(p_email, '')));
  requested text := lower(trim(coalesce(p_requested, 'customer')));
begin
  if normalized_email = 'pyaephyonaing.pol@gmail.com' then
    return 'admin';
  end if;

  if requested in ('vendor', 'seller') then
    return 'vendor';
  end if;

  return 'customer';
end;
$$;

revoke all on function public.map_signup_role(text, text) from public;
grant execute on function public.map_signup_role(text, text) to postgres, service_role;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assigned_role text;
  v_full_name text;
  v_avatar text;
  has_avatar boolean;
  has_updated boolean;
begin
  assigned_role := public.map_signup_role(
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'customer')
  );

  v_full_name := coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name'
  );
  v_avatar := new.raw_user_meta_data->>'avatar_url';

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'avatar_url'
  ) into has_avatar;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'updated_at'
  ) into has_updated;

  begin
    if has_avatar and has_updated then
      insert into public.profiles (id, email, full_name, avatar_url, role, updated_at)
      values (new.id, new.email, v_full_name, v_avatar, assigned_role, now())
      on conflict (id) do update
        set email = coalesce(excluded.email, public.profiles.email),
            full_name = coalesce(public.profiles.full_name, excluded.full_name),
            avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url),
            updated_at = now();
    elsif has_avatar then
      insert into public.profiles (id, email, full_name, avatar_url, role)
      values (new.id, new.email, v_full_name, v_avatar, assigned_role)
      on conflict (id) do update
        set email = coalesce(excluded.email, public.profiles.email),
            full_name = coalesce(public.profiles.full_name, excluded.full_name),
            avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url);
    else
      insert into public.profiles (id, email, full_name, role)
      values (new.id, new.email, v_full_name, assigned_role)
      on conflict (id) do update
        set email = coalesce(excluded.email, public.profiles.email),
            full_name = coalesce(public.profiles.full_name, excluded.full_name);
    end if;
  exception
    when unique_violation then
      raise warning 'handle_new_user: profile email conflict for % (%)', new.email, new.id;
    when others then
      raise warning 'handle_new_user failed for %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.ensure_own_profile()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_auth auth.users%rowtype;
  v_profile public.profiles%rowtype;
  assigned_role text;
  v_full_name text;
  v_avatar text;
  has_avatar boolean;
  has_updated boolean;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_profile
  from public.profiles
  where id = v_uid;

  if found then
    return v_profile;
  end if;

  select * into v_auth
  from auth.users
  where id = v_uid;

  if not found then
    raise exception 'Auth user not found';
  end if;

  assigned_role := public.map_signup_role(
    v_auth.email,
    coalesce(v_auth.raw_user_meta_data->>'role', 'customer')
  );
  v_full_name := coalesce(
    v_auth.raw_user_meta_data->>'full_name',
    v_auth.raw_user_meta_data->>'name'
  );
  v_avatar := v_auth.raw_user_meta_data->>'avatar_url';

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'avatar_url'
  ) into has_avatar;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'updated_at'
  ) into has_updated;

  perform set_config('app.bypass_profile_role_protect', 'on', true);

  if has_avatar and has_updated then
    insert into public.profiles (id, email, full_name, avatar_url, role, updated_at)
    values (v_auth.id, v_auth.email, v_full_name, v_avatar, assigned_role, now())
    on conflict (id) do update
      set email = coalesce(excluded.email, public.profiles.email)
    returning * into v_profile;
  elsif has_avatar then
    insert into public.profiles (id, email, full_name, avatar_url, role)
    values (v_auth.id, v_auth.email, v_full_name, v_avatar, assigned_role)
    on conflict (id) do update
      set email = coalesce(excluded.email, public.profiles.email)
    returning * into v_profile;
  else
    insert into public.profiles (id, email, full_name, role)
    values (v_auth.id, v_auth.email, v_full_name, assigned_role)
    on conflict (id) do update
      set email = coalesce(excluded.email, public.profiles.email)
    returning * into v_profile;
  end if;

  if to_regprocedure('public.ensure_user_wallets(uuid)') is not null then
    begin
      perform public.ensure_user_wallets(v_auth.id);
    exception
      when others then
        null;
    end;
  end if;

  return v_profile;
end;
$$;

revoke all on function public.ensure_own_profile() from public;
grant execute on function public.ensure_own_profile() to authenticated;

do $$
declare
  has_avatar boolean;
  has_updated boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'avatar_url'
  ) into has_avatar;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'updated_at'
  ) into has_updated;

  perform set_config('app.bypass_profile_role_protect', 'on', true);

  if has_avatar and has_updated then
    insert into public.profiles (id, email, full_name, avatar_url, role, updated_at)
    select
      u.id,
      u.email,
      coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name'),
      u.raw_user_meta_data->>'avatar_url',
      public.map_signup_role(u.email, coalesce(u.raw_user_meta_data->>'role', 'customer')),
      now()
    from auth.users u
    left join public.profiles p on p.id = u.id
    where p.id is null
      and u.email is not null
    on conflict (id) do nothing;
  elsif has_avatar then
    insert into public.profiles (id, email, full_name, avatar_url, role)
    select
      u.id,
      u.email,
      coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name'),
      u.raw_user_meta_data->>'avatar_url',
      public.map_signup_role(u.email, coalesce(u.raw_user_meta_data->>'role', 'customer'))
    from auth.users u
    left join public.profiles p on p.id = u.id
    where p.id is null
      and u.email is not null
    on conflict (id) do nothing;
  else
    insert into public.profiles (id, email, full_name, role)
    select
      u.id,
      u.email,
      coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name'),
      public.map_signup_role(u.email, coalesce(u.raw_user_meta_data->>'role', 'customer'))
    from auth.users u
    left join public.profiles p on p.id = u.id
    where p.id is null
      and u.email is not null
    on conflict (id) do nothing;
  end if;
end;
$$;
