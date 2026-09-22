-- Same complete vendors schema repair as
-- supabase/scripts/fix_vendors_owner_id.sql (for db push / migration history).

create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('customer', 'vendor', 'admin');
  end if;
  if not exists (select 1 from pg_type where typname = 'vendor_status') then
    create type public.vendor_status as enum ('pending', 'approved', 'suspended', 'rejected');
  end if;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text,
  role public.user_role not null default 'customer'
);

create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete restrict,
  name text not null,
  slug text not null unique,
  description text,
  status public.vendor_status not null default 'pending',
  commission_rate numeric(5, 2) not null default 10.00
    check (commission_rate >= 0 and commission_rate <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
    exception
      when duplicate_object then null;
      when others then null;
    end;
  end if;
end;
$$;

alter table public.vendors add column if not exists description text;
alter table public.vendors add column if not exists logo_url text;
alter table public.vendors add column if not exists banner_url text;
alter table public.vendors add column if not exists created_at timestamptz not null default now();
alter table public.vendors add column if not exists updated_at timestamptz not null default now();

create unique index if not exists vendors_owner_id_key on public.vendors (owner_id);
create index if not exists vendors_owner_id_idx on public.vendors (owner_id);
create index if not exists vendors_status_idx on public.vendors (status);

create or replace function public.owns_vendor(p_vendor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.vendors v
    where v.id = p_vendor_id and v.owner_id = auth.uid()
  );
$$;

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
  v_vendor_id uuid;
  v_slug text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (select 1 from public.profiles p where p.id = v_user_id) then
    raise exception
      'No profile for this account. Create public.profiles for your user first, then re-apply.';
  end if;

  p_name := nullif(trim(p_name), '');
  v_slug := lower(trim(p_slug));
  p_description := nullif(trim(p_description), '');

  if p_name is null then
    raise exception 'Store name is required';
  end if;

  if v_slug is null or v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'Slug must be lowercase letters, numbers, and hyphens';
  end if;

  if exists (select 1 from public.vendors v where v.owner_id = v_user_id) then
    raise exception 'You already have a vendor application';
  end if;

  if exists (select 1 from public.vendors v where v.slug = v_slug) then
    raise exception 'That store URL is already taken';
  end if;

  insert into public.vendors (owner_id, name, slug, description, status)
  values (v_user_id, p_name, v_slug, p_description, 'pending')
  returning id into v_vendor_id;

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

  return v_vendor_id;
end;
$$;

revoke all on function public.apply_for_vendor(text, text, text) from public;
grant execute on function public.apply_for_vendor(text, text, text) to authenticated;
