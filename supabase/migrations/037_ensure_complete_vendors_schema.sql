-- =============================================================================
-- 037_ensure_complete_vendors_schema.sql
--
-- Idempotent repair for live / incomplete public.vendors.
-- Adds EVERY column the app + RPCs expect in one shot so vendor apply does not
-- fail column-by-column (owner_id → slug → …).
--
-- Canonical columns match src/lib/types/database.ts Vendor + migrations
-- 001, 021, 024, 025, 029, 030.
--
-- FK chain:
--   auth.users.id  ←  public.profiles.id  ←  public.vendors.owner_id
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('customer', 'vendor', 'admin');
  end if;
  if not exists (select 1 from pg_type where typname = 'vendor_status') then
    create type public.vendor_status as enum (
      'pending', 'approved', 'suspended', 'rejected'
    );
  end if;
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'vendor_kyc_status'
  ) then
    create type public.vendor_kyc_status as enum (
      'unsubmitted', 'pending', 'approved', 'rejected'
    );
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles (FK target for owner_id)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text,
  role public.user_role not null default 'customer'
);

-- ---------------------------------------------------------------------------
-- vendors — create if missing (full shape); then ADD COLUMN for incomplete tables
-- ---------------------------------------------------------------------------
create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete restrict,
  name text not null,
  slug text not null unique,
  description text,
  logo_url text,
  banner_url text,
  status public.vendor_status not null default 'pending',
  commission_rate numeric(5, 2) not null default 10.00
    check (commission_rate >= 0 and commission_rate <= 100),
  max_import_items_override integer,
  ships_to_region_ids uuid[] not null default '{}'::uuid[],
  kyc_status public.vendor_kyc_status not null default 'unsubmitted',
  kyc_document_type text,
  kyc_document_url text,
  kyc_document_path text,
  kyc_legal_name text,
  kyc_document_number text,
  kyc_submitted_at timestamptz,
  kyc_reviewed_at timestamptz,
  kyc_reviewed_by uuid references auth.users (id) on delete set null,
  kyc_rejection_reason text,
  store_name text,
  contact_email text,
  telegram_handle text,
  usdt_payout_address text,
  usdt_deposit_address text,
  usdt_derivation_account integer,
  usdt_derivation_index integer,
  usdt_derivation_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Legacy user_id → owner_id
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
end;
$$;

-- Core identity columns (nullable first when table already had rows)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vendors' and column_name = 'owner_id'
  ) then
    alter table public.vendors
      add column owner_id uuid references public.profiles (id) on delete restrict;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vendors' and column_name = 'name'
  ) then
    alter table public.vendors add column name text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vendors' and column_name = 'slug'
  ) then
    alter table public.vendors add column slug text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vendors' and column_name = 'status'
  ) then
    alter table public.vendors
      add column status public.vendor_status not null default 'pending';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vendors' and column_name = 'commission_rate'
  ) then
    alter table public.vendors
      add column commission_rate numeric(5, 2) not null default 10.00;
  end if;
end;
$$;

-- Timestamps early (used by slug dedupe ordering)
alter table public.vendors
  add column if not exists created_at timestamptz not null default now();
alter table public.vendors
  add column if not exists updated_at timestamptz not null default now();

-- Backfill required text columns before unique / not-null expectations
update public.vendors
set name = coalesce(nullif(trim(name), ''), 'Store-' || substr(id::text, 1, 8))
where name is null or trim(name) = '';

update public.vendors
set slug = lower(regexp_replace(
  coalesce(nullif(trim(slug), ''), 'vendor-' || substr(replace(id::text, '-', ''), 1, 12)),
  '[^a-z0-9]+', '-', 'g'
))
where slug is null or trim(slug) = '';

-- Deduplicate slugs if needed (keep first row's slug)
do $$
declare
  r record;
  i int;
begin
  for r in
    select slug, array_agg(id order by created_at nulls last, id) as ids
    from public.vendors
    where slug is not null
    group by slug
    having count(*) > 1
  loop
    for i in 2 .. coalesce(array_length(r.ids, 1), 1) loop
      update public.vendors
      set slug = r.slug || '-' || substr(replace(r.ids[i]::text, '-', ''), 1, 8)
      where id = r.ids[i];
    end loop;
  end loop;
end;
$$;

do $$
begin
  alter table public.vendors alter column name set not null;
exception when others then
  raise notice 'Could not set vendors.name NOT NULL: %', sqlerrm;
end;
$$;

do $$
begin
  alter table public.vendors alter column slug set not null;
exception when others then
  raise notice 'Could not set vendors.slug NOT NULL: %', sqlerrm;
end;
$$;

-- Remaining app columns (IF NOT EXISTS — safe on every run)
alter table public.vendors add column if not exists description text;
alter table public.vendors add column if not exists logo_url text;
alter table public.vendors add column if not exists banner_url text;
alter table public.vendors add column if not exists max_import_items_override integer;
alter table public.vendors
  add column if not exists ships_to_region_ids uuid[] not null default '{}'::uuid[];
alter table public.vendors
  add column if not exists kyc_status public.vendor_kyc_status not null default 'unsubmitted';
alter table public.vendors add column if not exists kyc_document_type text;
alter table public.vendors add column if not exists kyc_document_url text;
alter table public.vendors add column if not exists kyc_document_path text;
alter table public.vendors add column if not exists kyc_legal_name text;
alter table public.vendors add column if not exists kyc_document_number text;
alter table public.vendors add column if not exists kyc_submitted_at timestamptz;
alter table public.vendors add column if not exists kyc_reviewed_at timestamptz;
alter table public.vendors
  add column if not exists kyc_reviewed_by uuid references auth.users (id) on delete set null;
alter table public.vendors add column if not exists kyc_rejection_reason text;
alter table public.vendors add column if not exists store_name text;
alter table public.vendors add column if not exists contact_email text;
alter table public.vendors add column if not exists telegram_handle text;
alter table public.vendors add column if not exists usdt_payout_address text;
alter table public.vendors add column if not exists usdt_deposit_address text;
alter table public.vendors add column if not exists usdt_derivation_account integer;
alter table public.vendors add column if not exists usdt_derivation_index integer;
alter table public.vendors add column if not exists usdt_derivation_path text;

-- FK owner_id → profiles
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
    exception
      when duplicate_object then null;
      when others then
        raise notice 'Could not add vendors_owner_id_fkey: %', sqlerrm;
    end;
  end if;
end;
$$;

-- KYC document type check
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'vendors_kyc_document_type_chk'
  ) then
    alter table public.vendors
      add constraint vendors_kyc_document_type_chk
      check (
        kyc_document_type is null
        or kyc_document_type in ('passport', 'national_id', 'trade_license')
      );
  end if;
end;
$$;

-- Import override check
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'vendors_max_import_items_override_chk'
  ) then
    begin
      alter table public.vendors
        add constraint vendors_max_import_items_override_chk
        check (
          max_import_items_override is null
          or max_import_items_override >= 0
        );
    exception when others then null;
    end;
  end if;
end;
$$;

-- Soft branding / contact backfills
update public.vendors
set store_name = coalesce(nullif(trim(store_name), ''), name)
where store_name is null or trim(store_name) = '';

update public.vendors v
set contact_email = p.email
from public.profiles p
where v.owner_id = p.id
  and (v.contact_email is null or trim(v.contact_email) = '')
  and nullif(trim(p.email), '') is not null;

update public.vendors
set usdt_payout_address = usdt_deposit_address
where (usdt_payout_address is null or trim(usdt_payout_address) = '')
  and nullif(trim(usdt_deposit_address), '') is not null;

-- Ensure id auto-generates even when the table already existed without a default
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vendors' and column_name = 'id'
  ) then
    alter table public.vendors alter column id set default gen_random_uuid();
  end if;
end;
$$;

-- Indexes
create unique index if not exists vendors_owner_id_key on public.vendors (owner_id);
create unique index if not exists vendors_slug_key on public.vendors (slug);
create index if not exists vendors_owner_id_idx on public.vendors (owner_id);
create index if not exists vendors_status_idx on public.vendors (status);
create index if not exists vendors_kyc_status_idx on public.vendors (kyc_status);
create index if not exists vendors_ships_to_region_ids_gin
  on public.vendors using gin (ships_to_region_ids);
create index if not exists vendors_store_name_idx
  on public.vendors (lower(store_name));
create index if not exists vendors_contact_email_idx
  on public.vendors (lower(contact_email))
  where contact_email is not null;
create unique index if not exists vendors_usdt_deposit_address_uidx
  on public.vendors (lower(usdt_deposit_address))
  where nullif(trim(usdt_deposit_address), '') is not null;

comment on table public.vendors is
  'Seller store for vendors and dropshippers. Dropshipper = same row with is_dropship products.';

-- ---------------------------------------------------------------------------
-- Helpers + RPCs used by vendor apply / admin review / contact profile
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.is_admin()') is null then
    create or replace function public.is_admin()
    returns boolean
    language sql
    stable
    security definer
    set search_path = public
    as $fn$
      select exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role = 'admin'
      );
    $fn$;
  end if;
end;
$$;

create or replace function public.owns_vendor(p_vendor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.vendors v
    where v.id = p_vendor_id
      and v.owner_id = auth.uid()
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
  v_vendor_id uuid := gen_random_uuid();
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

  insert into public.vendors (id, owner_id, name, slug, description, status, store_name)
  values (v_vendor_id, v_user_id, p_name, v_slug, p_description, 'pending', p_name);

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

create or replace function public.review_vendor(
  p_vendor_id uuid,
  p_status public.vendor_status
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can review vendors';
  end if;

  if p_status not in ('approved', 'rejected', 'suspended') then
    raise exception 'Invalid review status';
  end if;

  update public.vendors
  set status = p_status,
      updated_at = now()
  where id = p_vendor_id;

  if not found then
    raise exception 'Vendor not found';
  end if;

  if p_status = 'approved' then
    begin
      perform set_config('app.bypass_role_protect', 'true', true);
    exception when others then null;
    end;
    update public.profiles p
    set role = 'vendor'
    from public.vendors v
    where v.id = p_vendor_id
      and p.id = v.owner_id
      and p.role = 'customer';
  end if;
end;
$$;

revoke all on function public.review_vendor(uuid, public.vendor_status) from public;
grant execute on function public.review_vendor(uuid, public.vendor_status) to authenticated;

create or replace function public.update_vendor_contact_profile(
  p_vendor_id uuid,
  p_store_name text default null,
  p_contact_email text default null,
  p_telegram_handle text default null,
  p_usdt_payout_address text default null
)
returns public.vendors
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vendor public.vendors;
  v_telegram text;
begin
  if not (public.is_admin() or public.owns_vendor(p_vendor_id)) then
    raise exception 'Not allowed to update this vendor profile.';
  end if;

  v_telegram := nullif(trim(p_telegram_handle), '');
  if v_telegram is not null and left(v_telegram, 1) = '@' then
    v_telegram := substr(v_telegram, 2);
  end if;

  update public.vendors
  set
    store_name = coalesce(nullif(trim(p_store_name), ''), store_name, name),
    contact_email = coalesce(nullif(trim(p_contact_email), ''), contact_email),
    telegram_handle = case
      when p_telegram_handle is null then telegram_handle
      else v_telegram
    end,
    usdt_payout_address = case
      when p_usdt_payout_address is null then usdt_payout_address
      else nullif(trim(p_usdt_payout_address), '')
    end,
    updated_at = now()
  where id = p_vendor_id
  returning * into v_vendor;

  if not found then
    raise exception 'Vendor not found';
  end if;

  return v_vendor;
end;
$$;

revoke all on function public.update_vendor_contact_profile(uuid, text, text, text, text) from public;
grant execute on function public.update_vendor_contact_profile(uuid, text, text, text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Minimal RLS
-- ---------------------------------------------------------------------------
alter table public.vendors enable row level security;

drop policy if exists "vendors_select_approved_owner_or_admin" on public.vendors;
create policy "vendors_select_approved_owner_or_admin"
  on public.vendors for select
  using (
    status = 'approved'
    or owner_id = auth.uid()
    or public.is_admin()
  );

drop policy if exists "vendors_insert_owner" on public.vendors;
create policy "vendors_insert_owner"
  on public.vendors for insert
  with check (owner_id = auth.uid() or public.is_admin());

drop policy if exists "vendors_update_owner_or_admin" on public.vendors;
create policy "vendors_update_owner_or_admin"
  on public.vendors for update
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());
