-- Migration 0018: Assessor photo + comment support

-- =====================================================
-- 1. Add caption column
-- =====================================================

alter table public.permit_photos 
  add column if not exists caption text;

-- =====================================================
-- 2. Table-level RLS (permit_photos)
-- =====================================================

drop policy if exists permit_photos_insert on public.permit_photos;

create policy permit_photos_insert 
on public.permit_photos
for insert
to authenticated
with check (
  uploaded_by = auth.uid()
  and exists (
    select 1
    from public.permits p
    where p.id = permit_id
      and (
        -- Applicant upload
        (p.applicant_id = auth.uid() 
         and p.state in ('draft','pending_safety_assessment'))

        -- Assessor upload during assessment
        or (
          p.state = 'pending_safety_assessment'
          and (
            p.assessor_id = auth.uid()
            or public.has_role('assessor')
          )
        )

        -- Admin override
        or public.is_admin()
      )
  )
);

-- Update own caption / annotation
drop policy if exists permit_photos_update_own on public.permit_photos;

create policy permit_photos_update_own
on public.permit_photos
for update
to authenticated
using (
  uploaded_by = auth.uid()
  and exists (
    select 1
    from public.permits p
    where p.id = permit_id
      and p.state in ('draft','pending_safety_assessment')
  )
)
with check (
  uploaded_by = auth.uid()
);

-- =====================================================
-- 3. Storage-level RLS (storage.objects)
-- =====================================================

drop policy if exists "permit-photos insert" on storage.objects;

create policy "permit-photos insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'permit-photos'
  and exists (
    select 1
    from public.permits p
    where p.id = (split_part(name, '/', 1))::uuid
      and (
        -- Admin
        public.is_admin()

        -- Applicant
        or (
          p.applicant_id = auth.uid()
          and p.state in ('draft','pending_safety_assessment')
        )

        -- Assessor
        or (
          p.state = 'pending_safety_assessment'
          and (
            p.assessor_id = auth.uid()
            or public.has_role('assessor')
          )
        )
      )
  )
);