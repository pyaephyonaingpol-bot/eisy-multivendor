-- Public product image storage for vendor catalog uploads.
-- Object paths: {vendor_id}/{uuid}.{ext} so owns_vendor() can authorize writes.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  2097152, -- 2 MiB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public read (storefront + vendor previews).
drop policy if exists "product_images_select_public" on storage.objects;
create policy "product_images_select_public"
  on storage.objects for select
  using (bucket_id = 'product-images');

-- Vendors upload only under their own vendor_id folder; admins unrestricted.
drop policy if exists "product_images_insert_owner_or_admin" on storage.objects;
create policy "product_images_insert_owner_or_admin"
  on storage.objects for insert
  with check (
    bucket_id = 'product-images'
    and auth.role() = 'authenticated'
    and (
      public.is_admin()
      or (
        (storage.foldername(name))[1] is not null
        and public.owns_vendor(((storage.foldername(name))[1])::uuid)
      )
    )
  );

drop policy if exists "product_images_update_owner_or_admin" on storage.objects;
create policy "product_images_update_owner_or_admin"
  on storage.objects for update
  using (
    bucket_id = 'product-images'
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
    bucket_id = 'product-images'
    and auth.role() = 'authenticated'
    and (
      public.is_admin()
      or (
        (storage.foldername(name))[1] is not null
        and public.owns_vendor(((storage.foldername(name))[1])::uuid)
      )
    )
  );

drop policy if exists "product_images_delete_owner_or_admin" on storage.objects;
create policy "product_images_delete_owner_or_admin"
  on storage.objects for delete
  using (
    bucket_id = 'product-images'
    and auth.role() = 'authenticated'
    and (
      public.is_admin()
      or (
        (storage.foldername(name))[1] is not null
        and public.owns_vendor(((storage.foldername(name))[1])::uuid)
      )
    )
  );
