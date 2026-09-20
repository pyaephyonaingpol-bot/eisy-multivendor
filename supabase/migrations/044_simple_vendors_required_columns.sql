-- =============================================================================
-- 044_simple_vendors_required_columns.sql
--
-- Plain ALTER TABLE / ADD COLUMN IF NOT EXISTS only.
-- No pg_constraint / pg_class catalog queries (avoids name[] = text[] errors).
--
-- Ensures public.vendors has the columns needed for vendor apply:
--   id, user_id, owner_id, name, store_name, slug, usdt_payout_address, …
-- Paste into Supabase → SQL Editor → Run.
-- =============================================================================

create extension if not exists "pgcrypto";

-- Core identity / ownership
alter table public.vendors
  add column if not exists id uuid;

alter table public.vendors
  add column if not exists user_id uuid;

alter table public.vendors
  add column if not exists owner_id uuid;

alter table public.vendors
  add column if not exists name text;

alter table public.vendors
  add column if not exists store_name text;

alter table public.vendors
  add column if not exists slug text;

alter table public.vendors
  add column if not exists description text;

alter table public.vendors
  add column if not exists usdt_payout_address text;

alter table public.vendors
  add column if not exists contact_email text;

alter table public.vendors
  add column if not exists telegram_handle text;

alter table public.vendors
  add column if not exists logo_url text;

alter table public.vendors
  add column if not exists banner_url text;

alter table public.vendors
  add column if not exists created_at timestamptz default now();

alter table public.vendors
  add column if not exists updated_at timestamptz default now();

-- Defaults so apply inserts do not hit NOT NULL without values
alter table public.vendors alter column id set default gen_random_uuid();
alter table public.vendors alter column store_name set default '';
alter table public.vendors alter column usdt_payout_address set default '';
alter table public.vendors alter column contact_email set default '';
alter table public.vendors alter column telegram_handle set default '';
alter table public.vendors alter column created_at set default now();
alter table public.vendors alter column updated_at set default now();

-- Allow null / empty on optional profile fields (ignore if already nullable)
alter table public.vendors alter column usdt_payout_address drop not null;
alter table public.vendors alter column contact_email drop not null;
alter table public.vendors alter column telegram_handle drop not null;
alter table public.vendors alter column store_name drop not null;
alter table public.vendors alter column description drop not null;
alter table public.vendors alter column user_id drop not null;
alter table public.vendors alter column logo_url drop not null;
alter table public.vendors alter column banner_url drop not null;

-- Keep owner_id and user_id in sync when one side is missing
update public.vendors
set owner_id = user_id
where owner_id is null
  and user_id is not null;

update public.vendors
set user_id = owner_id
where user_id is null
  and owner_id is not null;

update public.vendors
set store_name = coalesce(nullif(trim(store_name), ''), nullif(trim(name), ''), '')
where store_name is null;

update public.vendors
set usdt_payout_address = coalesce(usdt_payout_address, '')
where usdt_payout_address is null;

update public.vendors
set slug = lower(regexp_replace(
  coalesce(nullif(trim(slug), ''), 'vendor-' || substr(replace(coalesce(id, gen_random_uuid())::text, '-', ''), 1, 12)),
  '[^a-z0-9]+',
  '-',
  'g'
))
where slug is null or trim(slug) = '';

-- Simple unique indexes (IF NOT EXISTS — no catalog lookups)
create unique index if not exists vendors_slug_uidx on public.vendors (slug);
create unique index if not exists vendors_owner_id_uidx on public.vendors (owner_id);
create index if not exists vendors_user_id_idx on public.vendors (user_id);
