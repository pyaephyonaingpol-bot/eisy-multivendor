-- =============================================================================
-- ensure_orders_customer_id.sql (paste-ready)
--
-- Fix: ensure_disputes_table / CJ-manual scripts failed with:
--   column o.customer_id does not exist
--
-- Canonical buyer column on public.orders is customer_id (FK → profiles).
-- Some drifted DBs use user_id instead. Normalize to customer_id before any
-- RLS / query that references o.customer_id.
-- =============================================================================

-- Prefer renaming legacy user_id → customer_id when customer_id is missing.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'orders'
      and column_name = 'user_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'orders'
      and column_name = 'customer_id'
  ) then
    alter table public.orders rename column user_id to customer_id;
  end if;
end;
$$;

-- Add customer_id when neither rename applied nor column present.
alter table public.orders
  add column if not exists customer_id uuid references public.profiles (id) on delete restrict;

-- If both user_id and customer_id somehow exist, copy then drop legacy user_id.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'orders'
      and column_name = 'user_id'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'orders'
      and column_name = 'customer_id'
  ) then
    execute $sql$
      update public.orders
      set customer_id = user_id
      where customer_id is null and user_id is not null
    $sql$;
    -- Keep user_id only if still required elsewhere; drop when safe.
    begin
      alter table public.orders drop column user_id;
    exception
      when others then null;
    end;
  end if;
end;
$$;

create index if not exists orders_customer_id_idx
  on public.orders (customer_id);

comment on column public.orders.customer_id is
  'Buyer profile id (auth user). Canonical customer column — not user_id.';

-- Recreate common participant RLS snippets that previously assumed customer_id.
-- (Safe no-ops when disputes table is absent.)
do $$
begin
  if to_regclass('public.disputes') is not null then
    execute $pol$
      drop policy if exists "disputes_select_participant_or_admin" on public.disputes
    $pol$;
    execute $pol$
      create policy "disputes_select_participant_or_admin"
        on public.disputes for select
        using (
          opened_by = auth.uid()
          or public.is_admin()
          or exists (
            select 1 from public.orders o
            where o.id = order_id
              and (
                o.customer_id = auth.uid()
                or public.owns_vendor(o.vendor_id)
                or (
                  o.seller_vendor_id is not null
                  and public.owns_vendor(o.seller_vendor_id)
                )
              )
          )
        )
    $pol$;
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.cj_order_fulfillments') is not null then
    execute $pol$
      drop policy if exists "cj_order_fulfillments_participant_select"
        on public.cj_order_fulfillments
    $pol$;
    execute $pol$
      create policy "cj_order_fulfillments_participant_select"
        on public.cj_order_fulfillments for select
        using (
          public.is_admin()
          or (vendor_id is not null and public.owns_vendor(vendor_id))
          or (seller_vendor_id is not null and public.owns_vendor(seller_vendor_id))
          or exists (
            select 1 from public.orders o
            where o.id = order_id and o.customer_id = auth.uid()
          )
        )
    $pol$;
  end if;
end;
$$;

notify pgrst, 'reload schema';
