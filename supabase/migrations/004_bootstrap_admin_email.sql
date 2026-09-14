-- Bootstrap a fixed admin email at signup.
-- Client metadata still cannot request "admin"; only this allowlisted address gets it.
-- Safe to run after 001–003.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text := coalesce(new.raw_user_meta_data->>'role', 'customer');
  assigned_role public.user_role := 'customer';
  normalized_email text := lower(trim(coalesce(new.email, '')));
begin
  -- Hard-coded bootstrap admin (not grantable via client metadata).
  if normalized_email = 'pyaephyonaing.pol@gmail.com' then
    assigned_role := 'admin';
  elsif requested_role = 'vendor' then
    assigned_role := 'vendor';
  else
    -- customer (default) or any other value including forged "admin" → customer
    assigned_role := 'customer';
  end if;

  insert into public.profiles (id, email, full_name, avatar_url, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url',
    assigned_role
  );
  return new;
end;
$$;

-- If this user already exists from an earlier signup, promote them now.
update public.profiles
set role = 'admin'
where lower(trim(email)) = 'pyaephyonaing.pol@gmail.com'
  and role is distinct from 'admin';
