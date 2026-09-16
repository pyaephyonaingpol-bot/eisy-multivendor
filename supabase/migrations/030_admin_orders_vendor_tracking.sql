-- =============================================================================
-- 030_admin_orders_vendor_tracking.sql
--
-- Ensure every order is tied to a seller vendor, and store vendor contact /
-- payout details for admin order management.
-- =============================================================================

-- 1) Reinforce orders → vendors linkage
alter table public.orders
  add column if not exists vendor_id uuid references public.vendors (id) on delete restrict;

alter table public.orders
  add column if not exists seller_vendor_id uuid references public.vendors (id) on delete set null;

-- Backfill seller from fulfillment vendor when missing (direct sales).
update public.orders
set seller_vendor_id = vendor_id
where seller_vendor_id is null
  and vendor_id is not null;

create index if not exists orders_vendor_id_idx on public.orders (vendor_id);
create index if not exists orders_seller_vendor_id_idx on public.orders (seller_vendor_id);

comment on column public.orders.vendor_id is
  'Fulfillment / supplier vendor for this order (FK → vendors).';
comment on column public.orders.seller_vendor_id is
  'Storefront seller (dropshipper or direct seller). Prefer this for admin vendor display.';

-- 2) Vendor contact + payout profile (admin-visible)
alter table public.vendors
  add column if not exists store_name text,
  add column if not exists contact_email text,
  add column if not exists telegram_handle text,
  add column if not exists usdt_payout_address text;

-- Backfill store_name from name; contact_email from owner profile when empty.
update public.vendors v
set store_name = coalesce(nullif(trim(v.store_name), ''), v.name)
where v.store_name is null or trim(v.store_name) = '';

update public.vendors v
set contact_email = p.email
from public.profiles p
where v.owner_id = p.id
  and (v.contact_email is null or trim(v.contact_email) = '')
  and nullif(trim(p.email), '') is not null;

-- Prefer HD deposit address as initial payout address when unset.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'vendors'
      and column_name = 'usdt_deposit_address'
  ) then
    execute $sql$
      update public.vendors
      set usdt_payout_address = usdt_deposit_address
      where (usdt_payout_address is null or trim(usdt_payout_address) = '')
        and nullif(trim(usdt_deposit_address), '') is not null
    $sql$;
  end if;
end $$;

create index if not exists vendors_store_name_idx
  on public.vendors (lower(store_name));

create index if not exists vendors_contact_email_idx
  on public.vendors (lower(contact_email))
  where contact_email is not null;

comment on column public.vendors.store_name is
  'Public store / brand name shown to buyers and admins.';
comment on column public.vendors.contact_email is
  'Primary vendor contact email for admin order / dispute outreach.';
comment on column public.vendors.telegram_handle is
  'Optional Telegram handle (with or without @) for vendor support.';
comment on column public.vendors.usdt_payout_address is
  'USDT TRC-20 payout wallet address for seller withdrawals / admin display.';

-- 3) Vendor can update their own contact / payout fields
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
    raise exception 'Vendor not found.';
  end if;

  return v_vendor;
end;
$$;

revoke all on function public.update_vendor_contact_profile(uuid, text, text, text, text) from public;
grant execute on function public.update_vendor_contact_profile(uuid, text, text, text, text) to authenticated;
