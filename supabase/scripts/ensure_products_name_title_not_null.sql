-- =============================================================================
-- ensure_products_name_title_not_null.sql (paste-ready)
--
-- CJ imports failed when a null title/name reached products:
--   null value in column "title" (or "name") violates not-null constraint
--
-- Canonical app column is products.name. Some drifted DBs also have title.
-- Ensure name is never null, keep title in sync when present, reload cache.
-- =============================================================================

alter table public.products
  add column if not exists name text;

-- Heal empty / null names before enforcing NOT NULL.
update public.products
set name = coalesce(
  nullif(trim(name), ''),
  nullif(trim(sku), ''),
  'Untitled product'
)
where name is null or trim(name) = '';

alter table public.products
  alter column name set default 'Untitled product';

do $$
begin
  alter table public.products
    alter column name set not null;
exception
  when others then null;
end;
$$;

-- Optional drifted `title` column (not in canonical schema): keep it usable.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'products'
      and column_name = 'title'
  ) then
    update public.products
    set title = coalesce(
      nullif(trim(title), ''),
      nullif(trim(name), ''),
      nullif(trim(sku), ''),
      'Untitled product'
    )
    where title is null or trim(title) = '';

    alter table public.products
      alter column title set default 'Untitled product';

    begin
      alter table public.products
        alter column title set not null;
    exception
      when others then null;
    end;
  end if;
end;
$$;

-- Keep title aligned with name on write when the drifted column exists.
create or replace function public.products_sync_title_from_name()
returns trigger
language plpgsql
as $$
begin
  if new.name is null or trim(new.name) = '' then
    new.name := coalesce(
      nullif(trim(new.sku), ''),
      'Untitled product'
    );
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'products'
      and column_name = 'title'
  ) then
    -- Assign only when the column is present (dynamic via NEW record fields).
    begin
      if new.title is null or trim(new.title) = '' then
        new.title := new.name;
      end if;
    exception
      when undefined_column then
        null;
    end;
  end if;

  return new;
end;
$$;

-- Prefer a simpler trigger that always sets name and optionally title via
-- to_jsonb detection (avoids undefined_column on DBs without title).
create or replace function public.products_ensure_name_and_title()
returns trigger
language plpgsql
as $$
declare
  has_title boolean;
begin
  if new.name is null or btrim(new.name) = '' then
    new.name := coalesce(nullif(btrim(coalesce(new.sku, '')), ''), 'Untitled product');
  else
    new.name := btrim(new.name);
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'products'
      and column_name = 'title'
  ) into has_title;

  if has_title then
    execute 'select $1.title' using new;
    -- Use jsonb round-trip so missing title column never hard-fails compile.
    -- When title exists, NEW has it; set via dynamic assignment:
    new := jsonb_populate_record(
      new,
      jsonb_build_object(
        'title',
        coalesce(
          nullif(btrim(coalesce((to_jsonb(new) ->> 'title'), '')), ''),
          new.name
        )
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists products_sync_title_from_name on public.products;
drop trigger if exists products_ensure_name_and_title on public.products;
drop function if exists public.products_sync_title_from_name();

create trigger products_ensure_name_and_title
  before insert or update of name, sku, title
  on public.products
  for each row
  execute function public.products_ensure_name_and_title();

comment on column public.products.name is
  'Storefront product title. Never null; CJ import maps productNameEn/title/name with fallbacks.';

notify pgrst, 'reload schema';
