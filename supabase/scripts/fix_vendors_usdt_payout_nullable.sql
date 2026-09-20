-- =============================================================================
-- 042_vendors_optional_profile_columns_nullable.sql
--
-- Vendor apply was failing with:
--   null value in column "usdt_payout_address" of relation "vendors"
--   violates not-null constraint
--
-- These profile fields are optional at application time. Make them nullable
-- (with empty-string defaults) so pending applications can be created without
-- collecting payout/contact details first.
-- =============================================================================

alter table public.vendors
  add column if not exists usdt_payout_address text;

alter table public.vendors
  add column if not exists contact_email text;

alter table public.vendors
  add column if not exists telegram_handle text;

alter table public.vendors
  add column if not exists store_name text;

-- Prefer empty string over NULL for live DBs that keep NOT NULL.
update public.vendors
set usdt_payout_address = coalesce(usdt_payout_address, '')
where usdt_payout_address is null;

update public.vendors
set contact_email = coalesce(contact_email, '')
where contact_email is null;

update public.vendors
set telegram_handle = coalesce(telegram_handle, '')
where telegram_handle is null;

alter table public.vendors
  alter column usdt_payout_address set default '';

alter table public.vendors
  alter column contact_email set default '';

alter table public.vendors
  alter column telegram_handle set default '';

-- Drop NOT NULL when present (canonical schema allows NULL / empty).
do $$
begin
  begin
    alter table public.vendors alter column usdt_payout_address drop not null;
  exception when others then
    raise notice 'usdt_payout_address drop not null: %', sqlerrm;
  end;
  begin
    alter table public.vendors alter column contact_email drop not null;
  exception when others then
    raise notice 'contact_email drop not null: %', sqlerrm;
  end;
  begin
    alter table public.vendors alter column telegram_handle drop not null;
  exception when others then
    raise notice 'telegram_handle drop not null: %', sqlerrm;
  end;
end;
$$;

comment on column public.vendors.usdt_payout_address is
  'Optional USDT TRC-20 payout wallet. Empty/null allowed at apply time.';
