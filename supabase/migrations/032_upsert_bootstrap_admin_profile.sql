-- Upsert bootstrap admin profile when public.profiles is empty / missing the row.
-- Same logic as supabase/scripts/upsert_bootstrap_admin_profile.sql (paste-ready).

create or replace function public.protect_profile_role()
returns trigger
language plpgsql
as $$
begin
  if nullif(current_setting('app.bypass_profile_role_protect', true), '') = 'on' then
    return new;
  end if;
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Only admins can change roles';
  end if;
  return new;
end;
$$;

do $$
declare
  v_email constant text := 'pyaephyonaing.pol@gmail.com';
  v_auth_id uuid;
  v_auth_email text;
  v_full_name text;
  v_avatar text;
  v_profile public.profiles%rowtype;
  v_auth_count int;
begin
  perform set_config('app.bypass_profile_role_protect', 'on', true);

  select count(*)::int into v_auth_count
  from auth.users
  where lower(trim(email)) = v_email;

  if v_auth_count = 0 then
    raise notice
      'No auth.users row for %. Sign up first, then re-run supabase/scripts/upsert_bootstrap_admin_profile.sql',
      v_email;
    return;
  end if;

  select
    u.id,
    u.email,
    coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name'),
    u.raw_user_meta_data->>'avatar_url'
  into v_auth_id, v_auth_email, v_full_name, v_avatar
  from auth.users u
  where lower(trim(u.email)) = v_email
  order by u.created_at asc
  limit 1;

  insert into public.profiles as p (
    id,
    email,
    full_name,
    avatar_url,
    role,
    created_at,
    updated_at
  )
  values (
    v_auth_id,
    coalesce(v_auth_email, v_email),
    v_full_name,
    v_avatar,
    'admin',
    now(),
    now()
  )
  on conflict (id) do update
  set
    email = coalesce(nullif(excluded.email, ''), p.email),
    full_name = coalesce(nullif(excluded.full_name, ''), p.full_name),
    avatar_url = coalesce(excluded.avatar_url, p.avatar_url),
    role = 'admin',
    updated_at = now()
  returning * into v_profile;

  begin
    insert into public.wallets (user_id, currency)
    select v_auth_id, c.currency
    from (
      values
        ('USDT'::public.wallet_currency),
        ('MMK'::public.wallet_currency)
    ) as c(currency)
    on conflict (user_id, currency) do nothing;
  exception
    when undefined_table then
      null;
    when undefined_object then
      null;
  end;

  raise notice 'Upserted admin profile: id=%, email=%, role=%',
    v_profile.id, v_profile.email, v_profile.role;
end;
$$;
