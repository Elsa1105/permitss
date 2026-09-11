-- =========================================================
-- 0004 STORAGE (PERMIT PHOTOS)
-- =========================================================

-- =========================================================
-- 1. BUCKET
-- =========================================================
insert into storage.buckets (id, name, public)
values ('permit-photos', 'permit-photos', false)
on conflict (id) do nothing;

-- =========================================================
-- PATH FORMAT
-- =========================================================
-- {permit_id}/{photo_id}.{ext}

-- =========================================================
-- 2. READ POLICY
-- =========================================================
drop policy if exists "permit-photos read" on storage.objects;

create policy "permit-photos read"
on storage.objects for select
to authenticated
using (
  bucket_id = 'permit-photos'
  and exists (
    select 1
    from public.permits p
    where p.id = (split_part(name, '/', 1))::uuid
      and p.company_id = public.get_user_company() -- 🔥 FIX FOI/CFE
      and (
        public.is_admin()
        or p.applicant_id = auth.uid()
        or p.assessor_id  = auth.uid()
        or p.srm_id       = auth.uid()
        or p.closer_id    = auth.uid()
      )
  )
);

-- =========================================================
-- 3. INSERT POLICY
-- =========================================================
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
      and p.company_id = public.get_user_company() -- 🔥 FIX FOI/CFE
      and (
        public.is_admin()
        or (
          p.applicant_id = auth.uid()
          and p.state in ('draft','pending_safety_assessment')
        )
      )
  )
);

-- =========================================================
-- 4. DELETE POLICY
-- =========================================================
drop policy if exists "permit-photos delete" on storage.objects;

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
      and p.company_id = public.get_user_company() -- 🔥 FIX FOI/CFE
      and p.state = 'draft'
  )
);