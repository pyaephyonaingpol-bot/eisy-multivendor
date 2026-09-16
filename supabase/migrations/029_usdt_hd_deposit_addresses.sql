-- =============================================================================
-- 029_usdt_hd_deposit_addresses.sql
--
-- Per-intent / per-vendor HD deposit addresses (BIP-44 TRON m/44'/195'/…).
-- Private keys stay off-DB; only address + derivation metadata are stored.
-- =============================================================================

alter table public.usdt_payment_settings
  add column if not exists hd_enabled boolean not null default false,
  add column if not exists hd_next_payment_index integer not null default 1
    check (hd_next_payment_index >= 0),
  add column if not exists hd_next_vendor_index integer not null default 0
    check (hd_next_vendor_index >= 0),
  add column if not exists hd_master_address text;

alter table public.usdt_payment_intents
  add column if not exists derivation_account integer,
  add column if not exists derivation_index integer,
  add column if not exists derivation_path text;

create unique index if not exists usdt_payment_intents_open_deposit_address_idx
  on public.usdt_payment_intents (lower(deposit_address))
  where status in ('pending', 'detecting')
    and nullif(trim(deposit_address), '') is not null;

create index if not exists usdt_payment_intents_derivation_idx
  on public.usdt_payment_intents (derivation_account, derivation_index)
  where derivation_index is not null;

-- Vendors may optionally hold a unique HD deposit address for direct funding.
alter table public.vendors
  add column if not exists usdt_deposit_address text,
  add column if not exists usdt_derivation_account integer,
  add column if not exists usdt_derivation_index integer,
  add column if not exists usdt_derivation_path text;

create unique index if not exists vendors_usdt_deposit_address_uidx
  on public.vendors (lower(usdt_deposit_address))
  where nullif(trim(usdt_deposit_address), '') is not null;

-- ---------------------------------------------------------------------------
-- Atomically allocate the next payment-intent derivation index.
-- ---------------------------------------------------------------------------

create or replace function public.allocate_usdt_hd_payment_index()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_index integer;
begin
  if auth.role() is distinct from 'authenticated'
     and auth.role() is distinct from 'service_role'
     and not public.is_admin() then
    raise exception 'Not authorized to allocate HD deposit index.';
  end if;

  update public.usdt_payment_settings
  set
    hd_next_payment_index = greatest(hd_next_payment_index, 1) + 1,
    hd_enabled = true,
    updated_at = now()
  where id = 1
  returning hd_next_payment_index - 1 into v_index;

  if v_index is null then
    insert into public.usdt_payment_settings (
      id, deposit_address, hd_next_payment_index, hd_enabled
    )
    values (1, '', 2, true)
    on conflict (id) do update
      set
        hd_next_payment_index = greatest(public.usdt_payment_settings.hd_next_payment_index, 1) + 1,
        hd_enabled = true,
        updated_at = now()
    returning hd_next_payment_index - 1 into v_index;
  end if;

  return coalesce(v_index, 1);
end;
$$;

revoke all on function public.allocate_usdt_hd_payment_index() from public;
grant execute on function public.allocate_usdt_hd_payment_index() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Atomically allocate the next vendor derivation index.
-- ---------------------------------------------------------------------------

create or replace function public.allocate_usdt_hd_vendor_index()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_index integer;
begin
  if not public.is_admin() and auth.role() is distinct from 'service_role' then
    raise exception 'Only admins can allocate vendor HD deposit indexes.';
  end if;

  update public.usdt_payment_settings
  set
    hd_next_vendor_index = hd_next_vendor_index + 1,
    hd_enabled = true,
    updated_at = now()
  where id = 1
  returning hd_next_vendor_index - 1 into v_index;

  if v_index is null then
    insert into public.usdt_payment_settings (id, deposit_address, hd_next_vendor_index, hd_enabled)
    values (1, '', 1, true)
    on conflict (id) do update
      set
        hd_next_vendor_index = public.usdt_payment_settings.hd_next_vendor_index + 1,
        hd_enabled = true,
        updated_at = now()
    returning hd_next_vendor_index - 1 into v_index;
  end if;

  return coalesce(v_index, 0);
end;
$$;

revoke all on function public.allocate_usdt_hd_vendor_index() from public;
grant execute on function public.allocate_usdt_hd_vendor_index() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Assign a derived deposit address onto a payment intent (owner or service).
-- ---------------------------------------------------------------------------

create or replace function public.assign_usdt_intent_hd_deposit(
  p_payment_intent_id uuid,
  p_deposit_address text,
  p_derivation_index integer,
  p_derivation_account integer default 0,
  p_derivation_path text default null
)
returns public.usdt_payment_intents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_intent public.usdt_payment_intents;
  v_address text := nullif(trim(p_deposit_address), '');
begin
  if v_address is null then
    raise exception 'Deposit address is required.';
  end if;
  if p_derivation_index is null or p_derivation_index < 0 then
    raise exception 'Derivation index is required.';
  end if;

  select * into v_intent
  from public.usdt_payment_intents
  where id = p_payment_intent_id
  for update;

  if not found then
    raise exception 'Payment intent not found.';
  end if;

  if v_intent.user_id is distinct from auth.uid()
     and not public.is_admin()
     and auth.role() is distinct from 'service_role' then
    raise exception 'Not allowed to update this payment intent.';
  end if;

  if v_intent.status not in ('pending', 'detecting') then
    raise exception 'Payment intent is no longer open.';
  end if;

  update public.usdt_payment_intents
  set
    deposit_address = v_address,
    derivation_account = coalesce(p_derivation_account, 0),
    derivation_index = p_derivation_index,
    derivation_path = coalesce(
      nullif(trim(p_derivation_path), ''),
      format('m/44''/195''/%s''/0/%s', coalesce(p_derivation_account, 0), p_derivation_index)
    ),
    updated_at = now()
  where id = p_payment_intent_id
  returning * into v_intent;

  insert into public.usdt_payment_events (payment_intent_id, event_type, payload)
  values (
    p_payment_intent_id,
    'hd_deposit_assigned',
    jsonb_build_object(
      'deposit_address', v_address,
      'derivation_account', coalesce(p_derivation_account, 0),
      'derivation_index', p_derivation_index,
      'derivation_path', v_intent.derivation_path
    )
  );

  return v_intent;
end;
$$;

revoke all on function public.assign_usdt_intent_hd_deposit(uuid, text, integer, integer, text) from public;
grant execute on function public.assign_usdt_intent_hd_deposit(uuid, text, integer, integer, text) to authenticated, service_role;

comment on function public.allocate_usdt_hd_payment_index() is
  'Atomically allocates the next BIP-44 payment derivation index (account 0).';
comment on function public.allocate_usdt_hd_vendor_index() is
  'Atomically allocates the next BIP-44 vendor derivation index (account 1).';
comment on function public.assign_usdt_intent_hd_deposit(uuid, text, integer, integer, text) is
  'Writes a derived TRON deposit address onto an open USDT payment intent.';
