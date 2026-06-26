-- Migration 0004: Storage bucket + policies for permit photos.

insert into storage.buckets (id, name, public)
values ('permit-photos', 'permit-photos', false)
on conflict (id) do nothing;

-- Photos in this bucket follow the path convention:
--   {permit_id}/{photo_id}.{ext}
-- The first path segment is the permit_id which is used for authz.

-- Read: any authenticated user that has access to the permit row.
create policy "permit-photos read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'permit-photos'
    and exists (
      select 1
        from public.permits p
       where p.id = (split_part(name, '/', 1))::uuid
         and (
           public.is_admin()
           or p.applicant_id = auth.uid()
           or p.assessor_id  = auth.uid()
           or p.srm_id       = auth.uid()
           or p.closer_id    = auth.uid()
           or public.has_role('assessor')
           or public.has_role('srm')
         )
    )
  );

-- Insert: applicant uploading to their own permit (or admin)
create policy "permit-photos insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'permit-photos'
    and exists (
      select 1
        from public.permits p
       where p.id = (split_part(name, '/', 1))::uuid
         and (
           public.is_admin()
           or (p.applicant_id = auth.uid() and p.state in ('draft','pending_safety_assessment'))
         )
    )
  );

-- Delete: only the uploader on a draft permit
create policy "permit-photos delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'permit-photos'
    and owner = auth.uid()
    and exists (
      select 1
        from public.permits p
       where p.id = (split_part(name, '/', 1))::uuid
         and p.state = 'draft'
    )
  );
