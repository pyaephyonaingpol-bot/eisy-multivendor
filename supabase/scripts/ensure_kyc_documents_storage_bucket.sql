-- =============================================================================
-- ensure_kyc_documents_storage_bucket.sql
--
-- Paste into Supabase → SQL Editor → Run.
-- Creates the private `kyc-documents` bucket used by /vendor/kyc uploads.
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
  select exists (
    select 1
    from public.vendors v
    where v.id = p_vendor_id
      and v.owner_id = auth.uid()
  );
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'kyc-documents',
  'kyc-documents',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "kyc_documents_select_owner_or_admin" on storage.objects;
create policy "kyc_documents_select_owner_or_admin"
  on storage.objects for select
  using (
    bucket_id = 'kyc-documents'
    and auth.role() = 'authenticated'
    and (
      public.is_admin()
      or (
        (storage.foldername(name))[1] is not null
        and public.owns_vendor(((storage.foldername(name))[1])::uuid)
      )
    )
  );

drop policy if exists "kyc_documents_insert_owner_or_admin" on storage.objects;
create policy "kyc_documents_insert_owner_or_admin"
  on storage.objects for insert
  with check (
    bucket_id = 'kyc-documents'
    and auth.role() = 'authenticated'
    and (
      public.is_admin()
      or (
        (storage.foldername(name))[1] is not null
        and public.owns_vendor(((storage.foldername(name))[1])::uuid)
      )
    )
  );

drop policy if exists "kyc_documents_update_owner_or_admin" on storage.objects;
create policy "kyc_documents_update_owner_or_admin"
  on storage.objects for update
  using (
    bucket_id = 'kyc-documents'
    and auth.role() = 'authenticated'
    and (
      public.is_admin()
      or (
        (storage.foldername(name))[1] is not null
        and public.owns_vendor(((storage.foldername(name))[1])::uuid)
      )
    )
  )
  with check (
    bucket_id = 'kyc-documents'
    and auth.role() = 'authenticated'
    and (
      public.is_admin()
      or (
        (storage.foldername(name))[1] is not null
        and public.owns_vendor(((storage.foldername(name))[1])::uuid)
      )
    )
  );

drop policy if exists "kyc_documents_delete_owner_or_admin" on storage.objects;
create policy "kyc_documents_delete_owner_or_admin"
  on storage.objects for delete
  using (
    bucket_id = 'kyc-documents'
    and auth.role() = 'authenticated'
    and (
      public.is_admin()
      or (
        (storage.foldername(name))[1] is not null
        and public.owns_vendor(((storage.foldername(name))[1])::uuid)
      )
    )
  );
