-- Migration 0018: Assessor photo + comment support
--
-- Problem: (1) permit_photos has no field for a comment/remark attached to
-- a specific photo, and (2) the RLS policy for inserting into permit_photos
-- (and the matching storage.objects policy) only allows the *applicant* to
-- upload, while the permit is in draft/pending_safety_assessment. The
-- Safety Assessor has no way to attach photo evidence + a remark when
-- declaring an employee/area Not Fit for Work.
--
-- Fix: add a `caption` column, and allow the assessor (or admin) to insert
-- and caption photos while the permit is pending_safety_assessment.

alter table public.permit_photos
  add column if not exists caption text;

-- ---------------------------------------------------------------------
-- Table-level RLS (permit_photos)
-- ---------------------------------------------------------------------

drop policy if exists permit_photos_insert on public.permit_photos;

create policy permit_photos_insert
  on public.permit_photos for insert
  to authenticated
  with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from public.permits p
       where p.id = permit_id
         and (
           (p.applicant_id = auth.uid() and p.state in ('draft','pending_safety_assessment'))
           or (
             p.state = 'pending_safety_assessment'
             and (
               p.assessor_id = auth.uid()
               or public.has_role('assessor')
             )
           )
           or public.is_admin()
         )
    )
  );

-- Allow the uploader (including the assessor) to edit their own photo's
-- caption / annotation after upload, while the permit is still in an
-- editable-before-final-assessment state.
drop policy if exists permit_photos_update_own on public.permit_photos;

create policy permit_photos_update_own
  on public.permit_photos for update
  to authenticated
  using (
    uploaded_by = auth.uid()
    and exists (
      select 1 from public.permits p
       where p.id = permit_id
         and p.state in ('draft','pending_safety_assessment')
    )
  )
  with check (
    uploaded_by = auth.uid()
  );

-- ---------------------------------------------------------------------
-- Storage-level RLS (storage.objects, bucket: permit-photos)
-- ---------------------------------------------------------------------

drop policy if exists "permit-photos insert" on storage.objects;

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
           or (
             p.state = 'pending_safety_assessment'
             and (p.assessor_id = auth.uid() or public.has_role('assessor'))
           )
         )
    )
  );
