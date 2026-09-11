-- =====================================================
-- 0006 PERMIT DOCUMENTS (RA / JSA / ETC)
-- =====================================================

-- =====================================================
-- 1. STORAGE BUCKET
-- =====================================================
insert into storage.buckets (id, name, public)
values ('permit-documents', 'permit-documents', false)
on conflict (id) do nothing;

-- =====================================================
-- 2. TABLE
-- =====================================================
create table if not exists public.permit_documents (
  id uuid primary key default gen_random_uuid(),

  permit_id uuid not null
    references public.permits(id) on delete cascade,

  uploaded_by uuid not null
    references public.users(id),

  document_type text not null check (
    document_type in (
      'risk_assessment',
      'jsa',
      'method_statement',
      'gas_test_record',
      'other'
    )
  ),

  file_name text not null,
  storage_path text not null,

  mime_type text,
  file_size bigint,

  created_at timestamptz not null default now()
);

create index if not exists permit_documents_permit_idx
on public.permit_documents (permit_id);

create index if not exists permit_documents_uploaded_by_idx
on public.permit_documents (uploaded_by);

alter table public.permit_documents enable row level security;

-- =====================================================
-- 3. TABLE POLICIES (🔥 FIXED WITH COMPANY SEGREGATION)
-- =====================================================

drop policy if exists "permit-documents read" on public.permit_documents;

create policy "permit-documents read"
on public.permit_documents
for select
to authenticated
using (
  exists (
    select 1
    from public.permits p
    where p.id = permit_documents.permit_id
      and p.company_id = public.get_user_company() -- 🔥 FIX
      and (
        public.is_admin()
        or p.applicant_id = auth.uid()
        or p.assessor_id = auth.uid()
        or p.srm_id = auth.uid()
        or p.closer_id = auth.uid()
      )
  )
);

-- INSERT
drop policy if exists "permit-documents insert" on public.permit_documents;

create policy "permit-documents insert"
on public.permit_documents
for insert
to authenticated
with check (
  uploaded_by = auth.uid()
  and exists (
    select 1
    from public.permits p
    where p.id = permit_documents.permit_id
      and p.company_id = public.get_user_company() -- 🔥 FIX
      and (
        public.is_admin()
        or (
          p.applicant_id = auth.uid()
          and p.state in ('draft','pending_safety_assessment')
        )
        or p.assessor_id = auth.uid()
        or p.srm_id = auth.uid()
      )
  )
);

-- DELETE
drop policy if exists "permit-documents delete" on public.permit_documents;

create policy "permit-documents delete"
on public.permit_documents
for delete
to authenticated
using (
  (
    uploaded_by = auth.uid()
    or public.is_admin()
  )
  and exists (
    select 1
    from public.permits p
    where p.id = permit_documents.permit_id
      and p.company_id = public.get_user_company() -- 🔥 FIX
      and p.state = 'draft'
  )
);

-- =====================================================
-- 4. STORAGE POLICIES (🔥 CONSISTENT WITH PHOTOS)
-- =====================================================

-- PATH:
-- permit-documents/{permit_id}/{document_id}.{ext}

drop policy if exists "permit-documents storage read" on storage.objects;

create policy "permit-documents storage read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'permit-documents'
  and exists (
    select 1
    from public.permits p
    where p.id = (split_part(name, '/', 1))::uuid
      and p.company_id = public.get_user_company() -- 🔥 FIX
      and (
        public.is_admin()
        or p.applicant_id = auth.uid()
        or p.assessor_id = auth.uid()
        or p.srm_id = auth.uid()
        or p.closer_id = auth.uid()
      )
  )
);

drop policy if exists "permit-documents storage insert" on storage.objects;

create policy "permit-documents storage insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'permit-documents'
  and exists (
    select 1
    from public.permits p
    where p.id = (split_part(name, '/', 1))::uuid
      and p.company_id = public.get_user_company() -- 🔥 FIX
      and (
        public.is_admin()
        or (
          p.applicant_id = auth.uid()
          and p.state in ('draft','pending_safety_assessment')
        )
        or p.assessor_id = auth.uid()
        or p.srm_id = auth.uid()
      )
  )
);

drop policy if exists "permit-documents storage delete" on storage.objects;

create policy "permit-documents storage delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'permit-documents'
  and (
    owner = auth.uid()
    or public.is_admin()
  )
  and exists (
    select 1
    from public.permits p
    where p.id = (split_part(name, '/', 1))::uuid
      and p.company_id = public.get_user_company() -- 🔥 FIX
      and p.state = 'draft'
  )
);