-- =============================================================================
-- 040_vendors_use_owner_id_not_user_id.sql
--
-- App code must use public.vendors.owner_id (never user_id).
-- PostgREST errors like:
--   Could not find the 'user_id' column of 'vendors' in the schema cache
-- happen when clients query a non-existent user_id column.
--
-- This migration ensures owner_id exists and renames legacy user_id → owner_id.
-- It does NOT create a user_id column.
-- =============================================================================

create extension if not exists "pgcrypto";

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

create unique index if not exists vendors_owner_id_key on public.vendors (owner_id);
create index if not exists vendors_owner_id_idx on public.vendors (owner_id);

-- Drop accidental user_id if both columns somehow exist (owner_id is canonical).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vendors' and column_name = 'user_id'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vendors' and column_name = 'owner_id'
  ) then
    -- Copy any missing owner_id values, then drop legacy column.
    execute 'update public.vendors set owner_id = user_id where owner_id is null';
    alter table public.vendors drop column user_id;
  end if;
end;
$$;

comment on column public.vendors.owner_id is
  'FK → profiles.id (auth user). Canonical owner column — do not use user_id.';
