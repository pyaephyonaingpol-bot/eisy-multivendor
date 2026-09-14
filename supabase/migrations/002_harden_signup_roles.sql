-- Harden signup so client metadata cannot create admin profiles.
-- Safe to run after 001_initial_schema.sql

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text := coalesce(new.raw_user_meta_data->>'role', 'customer');
  assigned_role public.user_role := 'customer';
begin
  if requested_role = 'vendor' then
    assigned_role := 'vendor';
  else
    -- customer (default) or any other value including 'admin' → customer
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
