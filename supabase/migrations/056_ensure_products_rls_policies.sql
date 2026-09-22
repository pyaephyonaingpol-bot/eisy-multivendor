-- =============================================================================
-- 056_ensure_products_rls_policies.sql
--
-- Product import fails with:
--   new row violates row-level security policy for table "products"
--
-- Causes seen on partial / healed DBs:
--   1) RLS enabled (e.g. by 055) without INSERT policies
--   2) Stale / renamed policies that no longer match owns_vendor(vendor_id)
--   3) Missing GRANT for authenticated role
--
-- products.vendor_id is the ownership key (not a user_id column). Ownership is
-- auth.uid() = vendors.owner_id via public.owns_vendor(vendor_id).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0) Helpers (security definer so RLS on vendors/profiles does not block checks)
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  );
$$;

create or replace function public.owns_vendor(p_vendor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_vendor_id is not null
    and auth.uid() is not null
    and exists (
      select 1
      from public.vendors v
      where v.id = p_vendor_id
        and v.owner_id = auth.uid()
    );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;

revoke all on function public.owns_vendor(uuid) from public;
grant execute on function public.owns_vendor(uuid) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1) Table privileges (RLS still gates rows)
-- ---------------------------------------------------------------------------

alter table public.products enable row level security;

grant select, insert, update, delete on table public.products to authenticated;
grant select on table public.products to anon;

-- ---------------------------------------------------------------------------
-- 2) Drop known legacy / alternate policy names, then recreate canonical set
-- ---------------------------------------------------------------------------

drop policy if exists "products_select_active_owner_or_admin" on public.products;
drop policy if exists "products_select_active_own_or_admin" on public.products;
drop policy if exists "products_select_own_or_admin" on public.products;
drop policy if exists "products_insert_owner" on public.products;
drop policy if exists "products_insert_own_vendor" on public.products;
drop policy if exists "products_insert_authenticated_owner" on public.products;
drop policy if exists "products_update_owner_or_admin" on public.products;
drop policy if exists "products_update_own_vendor" on public.products;
drop policy if exists "products_delete_owner_or_admin" on public.products;
drop policy if exists "products_delete_own_vendor" on public.products;

-- Public can read active listings; owners/admins see drafts too.
create policy "products_select_active_own_or_admin"
  on public.products
  for select
  to anon, authenticated
  using (
    status = 'active'
    or public.owns_vendor(vendor_id)
    or public.is_admin()
  );

-- Vendors / dropshippers (same vendors row) may insert for their own store.
-- Equivalent to verifying auth.uid() = vendors.owner_id for products.vendor_id.
create policy "products_insert_own_vendor"
  on public.products
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and (
      public.owns_vendor(vendor_id)
      or public.is_admin()
      or exists (
        select 1
        from public.vendors v
        where v.id = vendor_id
          and v.owner_id = auth.uid()
      )
    )
  );

create policy "products_update_own_vendor"
  on public.products
  for update
  to authenticated
  using (public.owns_vendor(vendor_id) or public.is_admin())
  with check (public.owns_vendor(vendor_id) or public.is_admin());

create policy "products_delete_own_vendor"
  on public.products
  for delete
  to authenticated
  using (public.owns_vendor(vendor_id) or public.is_admin());

comment on policy "products_insert_own_vendor" on public.products is
  'Authenticated vendor/dropshipper owners may insert products for vendors they own (vendors.owner_id = auth.uid()).';

-- Reload PostgREST so policy metadata is fresh (policies themselves apply immediately).
notify pgrst, 'reload schema';
