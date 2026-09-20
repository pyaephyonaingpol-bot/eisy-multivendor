-- =============================================================================
-- 043_fix_vendors_id_fk_and_owner_id.sql
--
-- Vendor apply failed with:
--   insert or update on table "vendors" violates foreign key constraint
--   "vendors_id_key"
--
-- Some live DBs incorrectly FK vendors.id → auth.users/profiles. Canonical
-- schema uses an independent vendors.id PK and owner_id → profiles.id.
--
-- This migration:
--   1) Ensures profiles exists for the FK target
--   2) Drops a misnamed FK on vendors.id (vendors_id_key) when it is a FK
--   3) Ensures owner_id → profiles.id
-- App insert uses id = owner_id = auth.uid() so either shape works.
-- =============================================================================

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text,
  role public.user_role not null default 'customer'
);

-- Drop mis-applied FK on vendors.id (name historically used for UNIQUE too).
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
      and t.relname = 'vendors'
      and c.contype = 'f'
      and (
        c.conname = 'vendors_id_key'
        or c.conname = 'vendors_id_fkey'
        or (
          -- FK whose only local column is "id"
          (select array_agg(a.attname order by u.ord)
           from unnest(c.conkey) with ordinality as u(attnum, ord)
           join pg_attribute a
             on a.attrelid = c.conrelid and a.attnum = u.attnum
          ) = array['id']::text[]
        )
      )
  loop
    execute format('alter table public.vendors drop constraint %I', r.conname);
    raise notice 'Dropped FK % on public.vendors', r.conname;
  end loop;
end;
$$;

-- Ensure owner_id exists and references profiles
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vendors' and column_name = 'user_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vendors' and column_name = 'owner_id'
  ) then
    alter table public.vendors rename column user_id to owner_id;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vendors' and column_name = 'owner_id'
  ) then
    alter table public.vendors
      add column owner_id uuid references public.profiles (id) on delete restrict;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'vendors_owner_id_fkey'
      and conrelid = 'public.vendors'::regclass
  ) then
    begin
      alter table public.vendors
        add constraint vendors_owner_id_fkey
        foreign key (owner_id)
        references public.profiles (id)
        on delete restrict;
    exception when others then
      raise notice 'Could not add vendors_owner_id_fkey: %', sqlerrm;
    end;
  end if;
end;
$$;

alter table public.vendors
  alter column id set default gen_random_uuid();

create unique index if not exists vendors_owner_id_key on public.vendors (owner_id);

-- apply_for_vendor: id = owner_id = auth.uid() (satisfies 1:1 + legacy id FKs)
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
  v_slug text;
  v_name text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (select 1 from public.profiles p where p.id = v_user_id) then
    raise exception
      'No profile for this account. Create public.profiles for your user first, then re-apply.';
  end if;

  v_name := nullif(trim(p_name), '');
  v_slug := lower(trim(p_slug));
  p_description := nullif(trim(p_description), '');

  if v_name is null then
    raise exception 'Store name is required';
  end if;

  if v_slug is null or v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'Slug must be lowercase letters, numbers, and hyphens';
  end if;

  if exists (select 1 from public.vendors v where v.owner_id = v_user_id or v.id = v_user_id) then
    raise exception 'You already have a vendor application';
  end if;

  if exists (select 1 from public.vendors v where v.slug = v_slug) then
    raise exception 'That store URL is already taken';
  end if;

  insert into public.vendors (
    id, owner_id, name, store_name, slug, description, status, usdt_payout_address
  )
  values (
    v_user_id, v_user_id, v_name, v_name, v_slug, p_description, 'pending', ''
  );

  begin
    perform set_config('app.bypass_role_protect', 'true', true);
  exception when others then null;
  end;
  begin
    perform set_config('app.bypass_profile_role_protect', 'on', true);
  exception when others then null;
  end;

  update public.profiles
  set role = 'vendor'
  where id = v_user_id
    and role = 'customer';

  return v_user_id;
end;
$$;

revoke all on function public.apply_for_vendor(text, text, text) from public;
grant execute on function public.apply_for_vendor(text, text, text) to authenticated;
