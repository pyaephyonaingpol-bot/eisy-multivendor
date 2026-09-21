-- Buyer delivery address book with a single default per user.
-- Default address pre-fills checkout and updates preferred_country_code.

create table if not exists public.buyer_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  label text null,
  full_name text not null,
  phone text null,
  line1 text not null,
  line2 text null,
  city text not null,
  region text null,
  postal_code text null,
  country_code text not null default 'MM',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint buyer_addresses_country_code_check
    check (char_length(country_code) = 2)
);

create index if not exists buyer_addresses_user_id_idx
  on public.buyer_addresses (user_id);

create index if not exists buyer_addresses_user_default_idx
  on public.buyer_addresses (user_id)
  where is_default;

-- At most one default address per buyer.
create unique index if not exists buyer_addresses_one_default_per_user
  on public.buyer_addresses (user_id)
  where is_default;

create or replace function public.set_buyer_addresses_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists buyer_addresses_set_updated_at on public.buyer_addresses;
create trigger buyer_addresses_set_updated_at
  before update on public.buyer_addresses
  for each row execute function public.set_buyer_addresses_updated_at();

-- When marking an address default, clear other defaults for that user and
-- mirror country onto profiles.preferred_country_code.
create or replace function public.buyer_addresses_enforce_single_default()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_default then
    update public.buyer_addresses
    set is_default = false,
        updated_at = now()
    where user_id = new.user_id
      and id is distinct from new.id
      and is_default;

    update public.profiles
    set preferred_country_code = upper(new.country_code),
        updated_at = now()
    where id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists buyer_addresses_enforce_single_default on public.buyer_addresses;
create trigger buyer_addresses_enforce_single_default
  before insert or update of is_default, country_code on public.buyer_addresses
  for each row
  when (new.is_default)
  execute function public.buyer_addresses_enforce_single_default();

alter table public.buyer_addresses enable row level security;

drop policy if exists "buyer_addresses_select_own" on public.buyer_addresses;
create policy "buyer_addresses_select_own"
  on public.buyer_addresses for select
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "buyer_addresses_insert_own" on public.buyer_addresses;
create policy "buyer_addresses_insert_own"
  on public.buyer_addresses for insert
  with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "buyer_addresses_update_own" on public.buyer_addresses;
create policy "buyer_addresses_update_own"
  on public.buyer_addresses for update
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "buyer_addresses_delete_own" on public.buyer_addresses;
create policy "buyer_addresses_delete_own"
  on public.buyer_addresses for delete
  using (user_id = auth.uid() or public.is_admin());

grant select, insert, update, delete on public.buyer_addresses to authenticated;
grant all on public.buyer_addresses to service_role;
