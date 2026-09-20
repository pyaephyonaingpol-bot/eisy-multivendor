-- =============================================================================
-- 049_ensure_submit_vendor_kyc_rpc.sql
--
-- Recreate public.submit_vendor_kyc with the exact PostgREST / app parameter
-- names used by src/lib/api/kyc-controller.ts and src/lib/vendors/actions.ts:
--   p_document_type, p_document_path, p_document_url, p_legal_name,
--   p_document_number
--
-- Also recreate review_vendor_kyc and allow SECURITY DEFINER KYC RPCs to
-- update privileged KYC columns (protect_vendor_privileged_columns otherwise
-- reverts them for non-admin callers).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Ensure enum + KYC columns exist (idempotent)
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'vendor_kyc_status'
  ) then
    create type public.vendor_kyc_status as enum (
      'unsubmitted',
      'pending',
      'approved',
      'rejected'
    );
  end if;
end;
$$;

alter table public.vendors
  add column if not exists kyc_status public.vendor_kyc_status not null default 'unsubmitted';

alter table public.vendors
  add column if not exists kyc_document_type text;

alter table public.vendors
  add column if not exists kyc_document_url text;

alter table public.vendors
  add column if not exists kyc_document_path text;

alter table public.vendors
  add column if not exists kyc_legal_name text;

alter table public.vendors
  add column if not exists kyc_document_number text;

alter table public.vendors
  add column if not exists kyc_submitted_at timestamptz;

alter table public.vendors
  add column if not exists kyc_reviewed_at timestamptz;

alter table public.vendors
  add column if not exists kyc_reviewed_by uuid references auth.users (id) on delete set null;

alter table public.vendors
  add column if not exists kyc_rejection_reason text;

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

create index if not exists vendors_kyc_status_idx
  on public.vendors (kyc_status);

-- ---------------------------------------------------------------------------
-- 2) Privileged-column guard: allow KYC writes when app.kyc_rpc = '1'
--    (set locally by submit_vendor_kyc / review_vendor_kyc)
-- ---------------------------------------------------------------------------

create or replace function public.protect_vendor_privileged_columns()
returns trigger
language plpgsql
as $$
declare
  v_kyc_rpc text := nullif(current_setting('app.kyc_rpc', true), '');
begin
  if public.is_admin() or v_kyc_rpc = '1' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.status := 'pending';
    new.commission_rate := coalesce(new.commission_rate, 10.00);
    new.kyc_status := 'unsubmitted';
    new.kyc_document_type := null;
    new.kyc_document_url := null;
    new.kyc_document_path := null;
    new.kyc_legal_name := null;
    new.kyc_document_number := null;
    new.kyc_submitted_at := null;
    new.kyc_reviewed_at := null;
    new.kyc_reviewed_by := null;
    new.kyc_rejection_reason := null;
  elsif tg_op = 'UPDATE' then
    new.status := old.status;
    new.commission_rate := old.commission_rate;
    new.owner_id := old.owner_id;
    -- KYC fields only change via submit_vendor_kyc / review_vendor_kyc
    -- (those set app.kyc_rpc = '1') or by admins.
    new.kyc_status := old.kyc_status;
    new.kyc_document_type := old.kyc_document_type;
    new.kyc_document_url := old.kyc_document_url;
    new.kyc_document_path := old.kyc_document_path;
    new.kyc_legal_name := old.kyc_legal_name;
    new.kyc_document_number := old.kyc_document_number;
    new.kyc_submitted_at := old.kyc_submitted_at;
    new.kyc_reviewed_at := old.kyc_reviewed_at;
    new.kyc_reviewed_by := old.kyc_reviewed_by;
    new.kyc_rejection_reason := old.kyc_rejection_reason;
  end if;

  return new;
end;
$$;

drop trigger if exists vendors_protect_privileged_columns on public.vendors;
create trigger vendors_protect_privileged_columns
  before insert or update on public.vendors
  for each row execute function public.protect_vendor_privileged_columns();

-- ---------------------------------------------------------------------------
-- 3) submit_vendor_kyc — exact named args expected by the app / PostgREST
-- ---------------------------------------------------------------------------

drop function if exists public.submit_vendor_kyc(text, text, text, text, text);

create or replace function public.submit_vendor_kyc(
  p_document_type text,
  p_document_path text,
  p_document_url text,
  p_legal_name text,
  p_document_number text default null
)
returns public.vendors
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_vendor public.vendors%rowtype;
  v_type text := lower(nullif(trim(coalesce(p_document_type, '')), ''));
  v_path text := nullif(trim(coalesce(p_document_path, '')), '');
  v_url text := nullif(trim(coalesce(p_document_url, '')), '');
  v_name text := nullif(trim(coalesce(p_legal_name, '')), '');
  v_number text := nullif(trim(coalesce(p_document_number, '')), '');
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if v_type is null or v_type not in ('passport', 'national_id', 'trade_license') then
    raise exception 'Document type must be passport, national_id, or trade_license';
  end if;

  if v_path is null then
    raise exception 'Document upload path is required';
  end if;

  if v_name is null then
    raise exception 'Legal name is required';
  end if;

  select * into v_vendor
  from public.vendors
  where owner_id = v_user_id
  for update;

  if not found then
    raise exception 'Vendor profile required to submit KYC';
  end if;

  if v_vendor.kyc_status = 'approved' then
    raise exception 'KYC is already approved';
  end if;

  if v_vendor.kyc_status = 'pending' then
    raise exception 'KYC is already pending review';
  end if;

  -- Object path must be under {vendor_id}/...
  if split_part(v_path, '/', 1) is distinct from v_vendor.id::text then
    raise exception 'Invalid KYC document path';
  end if;

  -- Allow this RPC to mutate privileged KYC columns.
  perform set_config('app.kyc_rpc', '1', true);

  update public.vendors
  set
    kyc_status = 'pending',
    kyc_document_type = v_type,
    kyc_document_path = v_path,
    kyc_document_url = v_url,
    kyc_legal_name = v_name,
    kyc_document_number = v_number,
    kyc_submitted_at = now(),
    kyc_reviewed_at = null,
    kyc_reviewed_by = null,
    kyc_rejection_reason = null,
    updated_at = now()
  where id = v_vendor.id
  returning * into v_vendor;

  return v_vendor;
end;
$$;

revoke all on function public.submit_vendor_kyc(text, text, text, text, text) from public;
grant execute on function public.submit_vendor_kyc(text, text, text, text, text)
  to authenticated, service_role;

comment on function public.submit_vendor_kyc(text, text, text, text, text) is
  'Owner submits KYC identity documents (p_document_type/path/url, p_legal_name, p_document_number) and sets kyc_status to pending.';

-- ---------------------------------------------------------------------------
-- 4) review_vendor_kyc (admin approve / reject)
-- ---------------------------------------------------------------------------

drop function if exists public.review_vendor_kyc(uuid, boolean, text);

create or replace function public.review_vendor_kyc(
  p_vendor_id uuid,
  p_approve boolean,
  p_rejection_reason text default null
)
returns public.vendors
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vendor public.vendors%rowtype;
  v_reason text := nullif(trim(coalesce(p_rejection_reason, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  if p_vendor_id is null then
    raise exception 'Vendor id is required';
  end if;

  select * into v_vendor
  from public.vendors
  where id = p_vendor_id
  for update;

  if not found then
    raise exception 'Vendor not found';
  end if;

  if v_vendor.kyc_status is distinct from 'pending' then
    raise exception 'Only pending KYC submissions can be reviewed (current: %)', v_vendor.kyc_status;
  end if;

  perform set_config('app.kyc_rpc', '1', true);

  if coalesce(p_approve, false) then
    update public.vendors
    set
      kyc_status = 'approved',
      kyc_reviewed_at = now(),
      kyc_reviewed_by = auth.uid(),
      kyc_rejection_reason = null,
      updated_at = now()
    where id = p_vendor_id
    returning * into v_vendor;
  else
    if v_reason is null then
      raise exception 'Rejection reason is required when rejecting KYC';
    end if;

    update public.vendors
    set
      kyc_status = 'rejected',
      kyc_reviewed_at = now(),
      kyc_reviewed_by = auth.uid(),
      kyc_rejection_reason = v_reason,
      updated_at = now()
    where id = p_vendor_id
    returning * into v_vendor;
  end if;

  return v_vendor;
end;
$$;

revoke all on function public.review_vendor_kyc(uuid, boolean, text) from public;
grant execute on function public.review_vendor_kyc(uuid, boolean, text)
  to authenticated, service_role;

comment on function public.review_vendor_kyc(uuid, boolean, text) is
  'Admin approves or rejects a pending vendor KYC submission.';

-- ---------------------------------------------------------------------------
-- 5) Reload PostgREST schema cache so the RPC appears immediately
-- ---------------------------------------------------------------------------

notify pgrst, 'reload schema';
