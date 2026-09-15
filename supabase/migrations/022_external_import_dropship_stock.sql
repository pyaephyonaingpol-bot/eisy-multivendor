-- External CJ/DSers imports are dropship listings without a marketplace
-- source_product_id. Keep supplier-synced stock_quantity (do not zero it).
-- Marketplace-to-marketplace dropship (is_dropship + source_product_id) still
-- holds no local inventory.

comment on column public.products.is_dropship is
  'True for dropshipper listings: either fulfills from source_product_id (internal) or from an external supplier route (CJ/DSers).';

create or replace function public.normalize_product_inventory()
returns trigger
language plpgsql
as $$
begin
  -- Only marketplace dropship copies hold zero local stock.
  if coalesce(new.is_dropship, false) and new.source_product_id is not null then
    new.stock_quantity := 0;
  end if;

  if new.product_type = 'digital' then
    new.stock_quantity := 0;
    new.download_url := nullif(trim(new.download_url), '');
    new.download_label := nullif(trim(new.download_label), '');
  else
    new.download_url := null;
    new.download_label := null;
  end if;
  return new;
end;
$$;
