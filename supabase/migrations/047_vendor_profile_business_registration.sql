-- =============================================================================
-- 047_vendor_profile_business_registration.sql
--
-- Business registration + contact phone for vendor profile page.
-- Extends update_vendor_contact_profile → update_vendor_profile RPC.
-- =============================================================================

alter table public.vendors
  add column if not exists contact_phone text;

alter table public.vendors
  add column if not exists business_legal_name text;

alter table public.vendors
  add column if not exists business_registration_number text;

alter table public.vendors
  add column if not exists business_address text;

alter table public.vendors
  add column if not exists business_country text;

comment on column public.vendors.contact_phone is
  'Vendor support / ops phone number (E.164 or local format).';
comment on column public.vendors.business_legal_name is
  'Registered business / company legal name for KYC and payouts.';
comment on column public.vendors.business_registration_number is
  'Company registration / tax / DICA number when applicable.';
comment on column public.vendors.business_address is
  'Registered business address.';
comment on column public.vendors.business_country is
  'ISO-ish country code or name for the registered business.';

-- ---------------------------------------------------------------------------
-- Comprehensive vendor profile updater (owner or admin)
-- ---------------------------------------------------------------------------

create or replace function public.update_vendor_profile(
  p_vendor_id uuid,
  p_store_name text default null,
  p_description text default null,
  p_contact_email text default null,
  p_contact_phone text default null,
  p_telegram_handle text default null,
  p_business_legal_name text default null,
  p_business_registration_number text default null,
  p_business_address text default null,
  p_business_country text default null,
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
  v_payout text;
begin
  if not (public.is_admin() or public.owns_vendor(p_vendor_id)) then
    raise exception 'Not allowed to update this vendor profile.';
  end if;

  v_telegram := nullif(trim(coalesce(p_telegram_handle, '')), '');
  if v_telegram is not null and left(v_telegram, 1) = '@' then
    v_telegram := substr(v_telegram, 2);
  end if;

  v_payout := nullif(trim(coalesce(p_usdt_payout_address, '')), '');
  if v_payout is not null and v_payout !~ '^T[1-9A-HJ-NP-Za-km-z]{33}$' then
    raise exception 'USDT payout address must be a valid TRC-20 address (starts with T).';
  end if;

  update public.vendors
  set
    store_name = case
      when p_store_name is null then store_name
      else coalesce(nullif(trim(p_store_name), ''), store_name, name)
    end,
    description = case
      when p_description is null then description
      else nullif(trim(p_description), '')
    end,
    contact_email = case
      when p_contact_email is null then contact_email
      else nullif(trim(p_contact_email), '')
    end,
    contact_phone = case
      when p_contact_phone is null then contact_phone
      else nullif(trim(p_contact_phone), '')
    end,
    telegram_handle = case
      when p_telegram_handle is null then telegram_handle
      else v_telegram
    end,
    business_legal_name = case
      when p_business_legal_name is null then business_legal_name
      else nullif(trim(p_business_legal_name), '')
    end,
    business_registration_number = case
      when p_business_registration_number is null then business_registration_number
      else nullif(trim(p_business_registration_number), '')
    end,
    business_address = case
      when p_business_address is null then business_address
      else nullif(trim(p_business_address), '')
    end,
    business_country = case
      when p_business_country is null then business_country
      else nullif(trim(p_business_country), '')
    end,
    usdt_payout_address = case
      when p_usdt_payout_address is null then usdt_payout_address
      else v_payout
    end,
    updated_at = now()
  where id = p_vendor_id
  returning * into v_vendor;

  if not found then
    raise exception 'Vendor not found.';
  end if;

  return v_vendor;
end;
$$;

revoke all on function public.update_vendor_profile(
  uuid, text, text, text, text, text, text, text, text, text, text
) from public;
grant execute on function public.update_vendor_profile(
  uuid, text, text, text, text, text, text, text, text, text, text
) to authenticated;

-- Keep legacy RPC as a thin wrapper for older clients.
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
begin
  return public.update_vendor_profile(
    p_vendor_id,
    p_store_name,
    null,
    p_contact_email,
    null,
    p_telegram_handle,
    null,
    null,
    null,
    null,
    p_usdt_payout_address
  );
end;
$$;

revoke all on function public.update_vendor_contact_profile(uuid, text, text, text, text) from public;
grant execute on function public.update_vendor_contact_profile(uuid, text, text, text, text) to authenticated;
