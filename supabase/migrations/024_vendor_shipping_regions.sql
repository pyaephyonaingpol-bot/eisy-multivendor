-- =============================================================================
-- 024_vendor_shipping_regions.sql
-- Seller-level shipping regions on vendors (shared by vendors + dropshippers).
-- Empty ships_to_region_ids = worldwide; non-empty restricts catalog/checkout.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Vendor shipping regions
-- ---------------------------------------------------------------------------

alter table public.vendors
  add column if not exists ships_to_region_ids uuid[] not null default '{}'::uuid[];

comment on column public.vendors.ships_to_region_ids is
  'When non-empty, this seller''s listings are only shown/sellable to these sourcing_regions. Empty = worldwide (still subject to product-level ships_to and supplier routes).';

create index if not exists vendors_ships_to_region_ids_gin
  on public.vendors using gin (ships_to_region_ids);

-- ---------------------------------------------------------------------------
-- 2) Deliverability: enforce seller shipping regions on the listing vendor
-- ---------------------------------------------------------------------------

create or replace function public.product_is_deliverable_to_country(
  p_product_id uuid,
  p_country_code text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_product public.products%rowtype;
  v_source_id uuid;
  v_region public.sourcing_regions%rowtype;
  v_global_id uuid;
  v_has_any_route boolean := false;
  v_vendor_ships_to uuid[] := '{}'::uuid[];
begin
  if p_product_id is null then
    return false;
  end if;

  select * into v_product
  from public.products
  where id = p_product_id;

  if not found then
    return false;
  end if;

  -- Digital goods are region-agnostic.
  if coalesce(v_product.product_type, 'physical') = 'digital' then
    return true;
  end if;

  v_region := public.resolve_sourcing_region(p_country_code);
  if v_region.id is null then
    return false;
  end if;

  -- Seller-level shipping regions (vendor or dropshipper storefront owner).
  select coalesce(v.ships_to_region_ids, '{}'::uuid[])
  into v_vendor_ships_to
  from public.vendors v
  where v.id = v_product.vendor_id;

  if coalesce(cardinality(v_vendor_ships_to), 0) > 0
     and not (v_region.id = any (v_vendor_ships_to)) then
    return false;
  end if;

  -- Explicit ships_to restriction on the storefront listing.
  if coalesce(cardinality(v_product.ships_to_region_ids), 0) > 0
     and not (v_region.id = any (v_product.ships_to_region_ids)) then
    return false;
  end if;

  v_source_id := case
    when coalesce(v_product.is_dropship, false) and v_product.source_product_id is not null
      then v_product.source_product_id
    else v_product.id
  end;

  select id into v_global_id
  from public.sourcing_regions
  where code = 'GLOBAL' and is_active = true
  limit 1;

  -- Active supplier route for the buyer region.
  if exists (
    select 1
    from public.product_supplier_routes r
    join public.supplier_providers sp on sp.id = r.provider_id
    where r.product_id = v_source_id
      and r.region_id = v_region.id
      and r.is_active = true
      and sp.is_active = true
  ) then
    return true;
  end if;

  -- GLOBAL catch-all route.
  if v_global_id is not null and exists (
    select 1
    from public.product_supplier_routes r
    join public.supplier_providers sp on sp.id = r.provider_id
    where r.product_id = v_source_id
      and r.region_id = v_global_id
      and r.is_active = true
      and sp.is_active = true
  ) then
    return true;
  end if;

  select exists (
    select 1
    from public.product_supplier_routes r
    join public.supplier_providers sp on sp.id = r.provider_id
    where r.product_id = v_source_id
      and r.is_active = true
      and sp.is_active = true
  ) into v_has_any_route;

  -- Local (non-dropship) inventory with no routes configured: treat as
  -- deliverable unless seller/product ships_to explicitly excludes the region
  -- (already enforced above).
  if not coalesce(v_product.is_dropship, false) and not v_has_any_route then
    return true;
  end if;

  -- Dropship / routed catalog without a matching region or GLOBAL route.
  return false;
end;
$$;

revoke all on function public.product_is_deliverable_to_country(uuid, text) from public;
grant execute on function public.product_is_deliverable_to_country(uuid, text) to anon, authenticated, service_role;

comment on function public.product_is_deliverable_to_country(uuid, text) is
  'True when the listing can ship to the buyer country via seller ships_to, product ships_to, and/or active supplier routes.';
