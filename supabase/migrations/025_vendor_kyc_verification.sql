-- =============================================================================
-- 025_vendor_kyc_verification.sql
-- Seller KYC for vendors + dropshippers (shared public.vendors row).
-- Unverified sellers cannot publish active products or withdraw wallet funds.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) KYC status enum + vendor columns
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

comment on column public.vendors.kyc_status is
  'Seller identity verification. approved is required to publish products and withdraw funds.';
comment on column public.vendors.kyc_document_type is
  'passport | national_id | trade_license';
comment on column public.vendors.kyc_document_path is
  'Object path inside the private kyc-documents storage bucket.';

create index if not exists vendors_kyc_status_idx
  on public.vendors (kyc_status);

-- ---------------------------------------------------------------------------
-- 2) Protect KYC + other privileged vendor columns from non-admin writes
-- ---------------------------------------------------------------------------

create or replace function public.protect_vendor_privileged_columns()
returns trigger
language plpgsql
as $$
begin
  if public.is_admin() then
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
    -- KYC fields only change via submit_vendor_kyc / review_vendor_kyc.
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

-- ---------------------------------------------------------------------------
-- 3) Private KYC document storage bucket
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'kyc-documents',
  'kyc-documents',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "kyc_documents_select_owner_or_admin" on storage.objects;
create policy "kyc_documents_select_owner_or_admin"
  on storage.objects for select
  using (
    bucket_id = 'kyc-documents'
    and auth.role() = 'authenticated'
    and (
      public.is_admin()
      or (
        (storage.foldername(name))[1] is not null
        and public.owns_vendor(((storage.foldername(name))[1])::uuid)
      )
    )
  );

drop policy if exists "kyc_documents_insert_owner_or_admin" on storage.objects;
create policy "kyc_documents_insert_owner_or_admin"
  on storage.objects for insert
  with check (
    bucket_id = 'kyc-documents'
    and auth.role() = 'authenticated'
    and (
      public.is_admin()
      or (
        (storage.foldername(name))[1] is not null
        and public.owns_vendor(((storage.foldername(name))[1])::uuid)
      )
    )
  );

drop policy if exists "kyc_documents_update_owner_or_admin" on storage.objects;
create policy "kyc_documents_update_owner_or_admin"
  on storage.objects for update
  using (
    bucket_id = 'kyc-documents'
    and auth.role() = 'authenticated'
    and (
      public.is_admin()
      or (
        (storage.foldername(name))[1] is not null
        and public.owns_vendor(((storage.foldername(name))[1])::uuid)
      )
    )
  )
  with check (
    bucket_id = 'kyc-documents'
    and auth.role() = 'authenticated'
    and (
      public.is_admin()
      or (
        (storage.foldername(name))[1] is not null
        and public.owns_vendor(((storage.foldername(name))[1])::uuid)
      )
    )
  );

drop policy if exists "kyc_documents_delete_owner_or_admin" on storage.objects;
create policy "kyc_documents_delete_owner_or_admin"
  on storage.objects for delete
  using (
    bucket_id = 'kyc-documents'
    and auth.role() = 'authenticated'
    and (
      public.is_admin()
      or (
        (storage.foldername(name))[1] is not null
        and public.owns_vendor(((storage.foldername(name))[1])::uuid)
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 4) Helpers + submit / review RPCs
-- ---------------------------------------------------------------------------

create or replace function public.vendor_kyc_is_approved(p_vendor_id uuid)
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
      and v.kyc_status = 'approved'
  );
$$;

revoke all on function public.vendor_kyc_is_approved(uuid) from public;
grant execute on function public.vendor_kyc_is_approved(uuid)
  to authenticated, service_role;

create or replace function public.assert_vendor_kyc_approved(p_vendor_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_status public.vendor_kyc_status;
begin
  select kyc_status into v_status
  from public.vendors
  where id = p_vendor_id;

  if not found then
    raise exception 'Vendor not found';
  end if;

  if v_status is distinct from 'approved' then
    raise exception
      'KYC verification required. Submit identity documents in Store settings before publishing products or withdrawing funds. Current status: %.',
      v_status;
  end if;
end;
$$;

revoke all on function public.assert_vendor_kyc_approved(uuid) from public;
grant execute on function public.assert_vendor_kyc_approved(uuid)
  to authenticated, service_role;

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

  if split_part(v_path, '/', 1) is distinct from v_vendor.id::text then
    raise exception 'Invalid KYC document path';
  end if;

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

-- ---------------------------------------------------------------------------
-- 5) Gate product publishing (status -> active)
-- ---------------------------------------------------------------------------

create or replace function public.enforce_vendor_kyc_for_active_products()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'active'
     and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    perform public.assert_vendor_kyc_approved(new.vendor_id);
  end if;
  return new;
end;
$$;

drop trigger if exists products_require_vendor_kyc_active on public.products;
create trigger products_require_vendor_kyc_active
  before insert or update of status, vendor_id on public.products
  for each row execute function public.enforce_vendor_kyc_for_active_products();

-- ---------------------------------------------------------------------------
-- 6) Gate wallet withdrawals for sellers (buyers without a vendor row unaffected)
-- ---------------------------------------------------------------------------

create or replace function public.request_wallet_withdrawal(
  p_currency public.wallet_currency,
  p_amount numeric,
  p_destination text,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_wallet public.wallets%rowtype;
  v_tx_id uuid;
  v_destination text := nullif(trim(coalesce(p_destination, '')), '');
  v_vendor_id uuid;
  v_kyc public.vendor_kyc_status;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_currency not in ('USDT', 'MMK') then
    raise exception 'Unsupported wallet currency';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Withdrawal amount must be greater than zero';
  end if;

  if v_destination is null then
    raise exception 'Withdrawal destination is required';
  end if;

  select id, kyc_status into v_vendor_id, v_kyc
  from public.vendors
  where owner_id = v_user_id
  limit 1;

  if v_vendor_id is not null and v_kyc is distinct from 'approved' then
    raise exception
      'KYC verification required before withdrawing funds. Current status: %.',
      coalesce(v_kyc::text, 'unsubmitted');
  end if;

  perform public.ensure_user_wallets(v_user_id);

  select * into v_wallet
  from public.wallets
  where user_id = v_user_id and currency = p_currency
  for update;

  if v_wallet.available_balance < p_amount then
    raise exception 'Insufficient % balance', p_currency;
  end if;

  update public.wallets
  set
    available_balance = available_balance - p_amount,
    pending_balance = pending_balance + p_amount
  where id = v_wallet.id;

  insert into public.wallet_transactions (
    wallet_id, user_id, currency, tx_type, status, amount, destination, note
  )
  values (
    v_wallet.id,
    v_user_id,
    p_currency,
    'withdrawal',
    'pending',
    p_amount,
    v_destination,
    nullif(trim(coalesce(p_note, '')), '')
  )
  returning id into v_tx_id;

  return v_tx_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7) Gate dropship import when publishing as active
-- ---------------------------------------------------------------------------

create or replace function public.import_dropship_product(
  p_source_product_id uuid,
  p_price numeric,
  p_status public.product_status default 'active'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_vendor public.vendors%rowtype;
  v_source public.products%rowtype;
  v_source_vendor public.vendors%rowtype;
  v_existing public.products%rowtype;
  v_new public.products%rowtype;
  v_price numeric(12, 2);
  v_slug text;
  v_status public.product_status;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_source_product_id is null then
    raise exception 'Source product is required';
  end if;

  v_price := round(coalesce(p_price, 0)::numeric, 2);
  if v_price <= 0 then
    raise exception 'Import price must be greater than zero';
  end if;

  v_status := coalesce(p_status, 'active');
  if v_status not in ('draft', 'active', 'archived') then
    v_status := 'active';
  end if;

  select * into v_vendor
  from public.vendors
  where owner_id = v_user_id
  limit 1;

  if not found then
    raise exception 'Vendor profile required to import products';
  end if;

  if v_vendor.status is distinct from 'approved' then
    raise exception 'Only approved vendors can import dropship products';
  end if;

  if v_status = 'active' then
    perform public.assert_vendor_kyc_approved(v_vendor.id);
  end if;

  select * into v_source
  from public.products
  where id = p_source_product_id
  for share;

  if not found then
    raise exception 'Source product not found';
  end if;

  if coalesce(v_source.is_dropship, false) and v_source.source_product_id is not null then
    select * into v_source
    from public.products
    where id = v_source.source_product_id
    for share;

    if not found then
      raise exception 'Source product not found';
    end if;
  end if;

  if v_source.status is distinct from 'active' then
    raise exception 'Only active catalog products can be imported';
  end if;

  if v_source.vendor_id = v_vendor.id then
    raise exception 'You already sell this product';
  end if;

  if v_price < v_source.price then
    raise exception
      'Listing price % USDT cannot be below supplier price % USDT',
      v_price,
      v_source.price;
  end if;

  select * into v_source_vendor
  from public.vendors
  where id = v_source.vendor_id;

  if not found or v_source_vendor.status is distinct from 'approved' then
    raise exception 'Supplier is not an approved vendor';
  end if;

  select * into v_existing
  from public.products
  where vendor_id = v_vendor.id
    and source_product_id = v_source.id
  limit 1;

  if found then
    update public.products
    set
      price = v_price,
      status = v_status,
      updated_at = now()
    where id = v_existing.id
    returning * into v_new;

    return jsonb_build_object(
      'product_id', v_new.id,
      'source_product_id', v_source.id,
      'updated', true,
      'price', v_new.price,
      'status', v_new.status,
      'slug', v_new.slug
    );
  end if;

  perform public.assert_vendor_can_import_product(v_vendor.id, true);

  v_slug := left(
    regexp_replace(
      lower(trim(v_source.slug || '-ds-' || substr(replace(v_vendor.id::text, '-', ''), 1, 8))),
      '[^a-z0-9]+',
      '-',
      'g'
    ),
    80
  );
  v_slug := trim(both '-' from v_slug);

  insert into public.products (
    vendor_id,
    category_id,
    name,
    slug,
    description,
    price,
    compare_at_price,
    currency,
    sku,
    stock_quantity,
    images,
    specifications,
    status,
    product_type,
    download_url,
    download_label,
    source_product_id,
    is_dropship
  )
  values (
    v_vendor.id,
    v_source.category_id,
    v_source.name,
    v_slug,
    v_source.description,
    v_price,
    v_source.compare_at_price,
    'USDT',
    v_source.sku,
    0,
    coalesce(v_source.images, '[]'::jsonb),
    coalesce(v_source.specifications, '[]'::jsonb),
    v_status,
    coalesce(v_source.product_type, 'physical'),
    v_source.download_url,
    v_source.download_label,
    v_source.id,
    true
  )
  returning * into v_new;

  return jsonb_build_object(
    'product_id', v_new.id,
    'source_product_id', v_source.id,
    'updated', false,
    'price', v_new.price,
    'status', v_new.status,
    'slug', v_new.slug
  );
end;
$$;

revoke all on function public.import_dropship_product(uuid, numeric, public.product_status) from public;
grant execute on function public.import_dropship_product(uuid, numeric, public.product_status)
  to authenticated, service_role;

comment on function public.submit_vendor_kyc(text, text, text, text, text) is
  'Owner submits KYC documents and moves kyc_status to pending.';
comment on function public.review_vendor_kyc(uuid, boolean, text) is
  'Admin approves or rejects a pending KYC submission.';
comment on function public.assert_vendor_kyc_approved(uuid) is
  'Raises unless the vendor KYC status is approved.';
