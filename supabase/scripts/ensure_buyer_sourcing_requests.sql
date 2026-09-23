-- Buyer product sourcing requests (custom product find / CJ lookup).
-- Safe to re-run.

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'sourcing_request_status'
  ) then
    create type public.sourcing_request_status as enum (
      'pending',
      'reviewing',
      'sourced',
      'rejected',
      'closed'
    );
  end if;
end $$;

create table if not exists public.sourcing_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  product_name text not null,
  product_url text null,
  image_url text null,
  image_path text null,
  notes text null,
  status public.sourcing_request_status not null default 'pending',
  cj_external_product_id text null,
  cj_match_title text null,
  cj_match_image_url text null,
  cj_match_payload jsonb null,
  admin_notes text null,
  reviewed_at timestamptz null,
  reviewed_by uuid null references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sourcing_requests_product_name_len
    check (char_length(trim(product_name)) between 2 and 200),
  constraint sourcing_requests_notes_len
    check (notes is null or char_length(notes) <= 2000),
  constraint sourcing_requests_url_len
    check (product_url is null or char_length(product_url) <= 2000)
);

create index if not exists sourcing_requests_user_id_idx
  on public.sourcing_requests (user_id);

create index if not exists sourcing_requests_status_idx
  on public.sourcing_requests (status);

create index if not exists sourcing_requests_created_at_idx
  on public.sourcing_requests (created_at desc);

create or replace function public.set_sourcing_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists sourcing_requests_set_updated_at on public.sourcing_requests;
create trigger sourcing_requests_set_updated_at
  before update on public.sourcing_requests
  for each row execute function public.set_sourcing_requests_updated_at();

alter table public.sourcing_requests enable row level security;

drop policy if exists "sourcing_requests_select_own_or_admin" on public.sourcing_requests;
create policy "sourcing_requests_select_own_or_admin"
  on public.sourcing_requests for select
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "sourcing_requests_insert_own" on public.sourcing_requests;
create policy "sourcing_requests_insert_own"
  on public.sourcing_requests for insert
  with check (user_id = auth.uid());

drop policy if exists "sourcing_requests_update_own_or_admin" on public.sourcing_requests;
create policy "sourcing_requests_update_own_or_admin"
  on public.sourcing_requests for update
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "sourcing_requests_delete_own_or_admin" on public.sourcing_requests;
create policy "sourcing_requests_delete_own_or_admin"
  on public.sourcing_requests for delete
  using (user_id = auth.uid() or public.is_admin());

grant select, insert, update, delete on public.sourcing_requests to authenticated;
grant all on public.sourcing_requests to service_role;

-- Public image bucket for request reference photos.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sourcing-request-images',
  'sourcing-request-images',
  true,
  2097152, -- 2 MiB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  name = excluded.name,
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "sourcing_request_images_select_public" on storage.objects;
create policy "sourcing_request_images_select_public"
  on storage.objects for select
  using (bucket_id = 'sourcing-request-images');

drop policy if exists "sourcing_request_images_insert_own" on storage.objects;
create policy "sourcing_request_images_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'sourcing-request-images'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "sourcing_request_images_update_own_or_admin" on storage.objects;
create policy "sourcing_request_images_update_own_or_admin"
  on storage.objects for update
  using (
    bucket_id = 'sourcing-request-images'
    and auth.role() = 'authenticated'
    and (
      public.is_admin()
      or (storage.foldername(name))[1] = auth.uid()::text
    )
  );

drop policy if exists "sourcing_request_images_delete_own_or_admin" on storage.objects;
create policy "sourcing_request_images_delete_own_or_admin"
  on storage.objects for delete
  using (
    bucket_id = 'sourcing-request-images'
    and auth.role() = 'authenticated'
    and (
      public.is_admin()
      or (storage.foldername(name))[1] = auth.uid()::text
    )
  );
