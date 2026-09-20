-- =============================================================================
-- ensure_products_rls_policies.sql
--
-- Paste-ready: fix "new row violates row-level security policy for table
-- products" on vendor/dropshipper import by ensuring INSERT (and related)
-- policies allow owners via vendors.owner_id = auth.uid().
-- =============================================================================

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

alter table public.products enable row level security;

grant select, insert, update, delete on table public.products to authenticated;
grant select on table public.products to anon;

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

create policy "products_select_active_own_or_admin"
  on public.products
  for select
  to anon, authenticated
  using (
    status = 'active'
    or public.owns_vendor(vendor_id)
    or public.is_admin()
  );

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

notify pgrst, 'reload schema';
