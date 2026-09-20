-- Ensure bootstrap admin profile exists and has role = admin.
-- Safe to re-run.
--
-- Target: pyaephyonaing.pol@gmail.com (case-insensitive)
--
-- Role changes are blocked by profiles_protect_role when auth.uid() is null
-- (typical for migrations / service scripts). This migration:
--   1) Adds a session flag that the trigger honors
--   2) Upserts the bootstrap admin profile via a security-definer helper
--   3) Adds ensure_own_profile() so /profile can self-heal missing rows

create or replace function public.protect_profile_role()
returns trigger
language plpgsql
as $$
begin
  -- Allow trusted migrations / security-definer helpers to opt out.
  if nullif(current_setting('app.bypass_profile_role_protect', true), '') = 'on' then
    return new;
  end if;

  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Only admins can change roles';
  end if;
  return new;
end;
$$;

create or replace function public.ensure_bootstrap_admin_profile(
  p_email text default 'pyaephyonaing.pol@gmail.com'
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_auth auth.users%rowtype;
  v_profile public.profiles%rowtype;
begin
  if v_email = '' then
    raise exception 'Email is required';
  end if;

  select * into v_auth
  from auth.users
  where lower(trim(email)) = v_email
  order by created_at asc
  limit 1;

  if not found then
    raise exception
      'No auth.users row for %. Sign up with that email first, then re-run this function.',
      v_email;
  end if;

  perform set_config('app.bypass_profile_role_protect', 'on', true);

  select * into v_profile
  from public.profiles
  where id = v_auth.id;

  if not found then
    insert into public.profiles (
      id,
      email,
      full_name,
      avatar_url,
      role
    )
    values (
      v_auth.id,
      coalesce(v_auth.email, v_email),
      coalesce(
        v_auth.raw_user_meta_data->>'full_name',
        v_auth.raw_user_meta_data->>'name'
      ),
      v_auth.raw_user_meta_data->>'avatar_url',
      'admin'
    )
    returning * into v_profile;
  else
    update public.profiles
    set
      role = 'admin',
      email = coalesce(nullif(email, ''), v_auth.email, v_email),
      full_name = coalesce(
        nullif(full_name, ''),
        v_auth.raw_user_meta_data->>'full_name',
        v_auth.raw_user_meta_data->>'name',
        full_name
      ),
      updated_at = now()
    where id = v_auth.id
    returning * into v_profile;
  end if;

  if to_regprocedure('public.ensure_user_wallets(uuid)') is not null then
    perform public.ensure_user_wallets(v_auth.id);
  else
    begin
      insert into public.wallets (user_id, currency)
      select v_auth.id, c.currency
      from (
        values
          ('USDT'::public.wallet_currency),
          ('MMK'::public.wallet_currency)
      ) as c(currency)
      on conflict (user_id, currency) do nothing;
    exception
      when undefined_table then
        null;
    end;
  end if;

  return v_profile;
end;
$$;

revoke all on function public.ensure_bootstrap_admin_profile(text) from public;
grant execute on function public.ensure_bootstrap_admin_profile(text) to postgres;
grant execute on function public.ensure_bootstrap_admin_profile(text) to service_role;

-- Self-heal: signed-in users with an auth row but no profiles row.
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
  v_role public.user_role := 'customer';
  v_email text;
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

  v_email := lower(trim(coalesce(v_auth.email, '')));
  if v_email = 'pyaephyonaing.pol@gmail.com' then
    v_role := 'admin';
  elsif coalesce(v_auth.raw_user_meta_data->>'role', '') = 'vendor' then
    v_role := 'vendor';
  else
    v_role := 'customer';
  end if;

  perform set_config('app.bypass_profile_role_protect', 'on', true);

  insert into public.profiles (id, email, full_name, avatar_url, role)
  values (
    v_auth.id,
    coalesce(v_auth.email, v_email),
    coalesce(
      v_auth.raw_user_meta_data->>'full_name',
      v_auth.raw_user_meta_data->>'name'
    ),
    v_auth.raw_user_meta_data->>'avatar_url',
    v_role
  )
  on conflict (id) do update
    set email = coalesce(excluded.email, public.profiles.email)
  returning * into v_profile;

  if to_regprocedure('public.ensure_user_wallets(uuid)') is not null then
    perform public.ensure_user_wallets(v_auth.id);
  end if;

  return v_profile;
end;
$$;

revoke all on function public.ensure_own_profile() from public;
grant execute on function public.ensure_own_profile() to authenticated;

do $$
begin
  perform public.ensure_bootstrap_admin_profile('pyaephyonaing.pol@gmail.com');
  raise notice 'Bootstrap admin profile ensured for pyaephyonaing.pol@gmail.com';
exception
  when others then
    raise notice 'ensure_bootstrap_admin_profile skipped: %', sqlerrm;
end;
$$;
