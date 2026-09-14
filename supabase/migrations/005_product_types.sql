-- Physical vs digital products and download metadata for digital goods.

create type public.product_type as enum ('physical', 'digital');

alter table public.products
  add column if not exists product_type public.product_type not null default 'physical',
  add column if not exists download_url text,
  add column if not exists download_label text;

comment on column public.products.product_type is
  'physical = shippable good with stock; digital = downloadable file/link';

comment on column public.products.download_url is
  'HTTPS URL or storage path for digital product delivery';

comment on column public.products.download_label is
  'Optional display name for the digital download (e.g. filename)';

create index if not exists products_product_type_idx
  on public.products (product_type);

-- Digital products should not track physical inventory; keep stock at 0.
create or replace function public.normalize_product_inventory()
returns trigger
language plpgsql
as $$
begin
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

drop trigger if exists products_normalize_inventory on public.products;

create trigger products_normalize_inventory
  before insert or update on public.products
  for each row execute function public.normalize_product_inventory();
