-- Migration 0006: Permit supporting documents / RA upload

-- =====================================================
-- 1. Storage bucket for supporting documents
-- =====================================================

insert into storage.buckets (id, name, public)
values ('permit-documents', 'permit-documents', false)
on conflict (id) do nothing;

-- =====================================================
-- 2. Permit documents table
-- =====================================================

create table if not exists public.permit_documents (
  id uuid primary key default gen_random_uuid(),
  permit_id uuid not null references public.permits(id) on delete cascade,
  uploaded_by uuid not null references public.users(id),
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
-- 3. Permit documents table policies
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
      and (
        public.is_admin()
        or p.applicant_id = auth.uid()
        or p.assessor_id = auth.uid()
        or p.srm_id = auth.uid()
        or p.closer_id = auth.uid()
        or public.has_role('assessor')
        or public.has_role('srm')
      )
  )
);

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
      and (
        public.is_admin()
        or p.applicant_id = auth.uid()
        or public.has_role('assessor')
        or public.has_role('srm')
      )
  )
);

drop policy if exists "permit-documents delete" on public.permit_documents;

create policy "permit-documents delete"
on public.permit_documents
for delete
to authenticated
using (
  uploaded_by = auth.uid()
  or public.is_admin()
);

-- =====================================================
-- 4. Storage object policies for permit-documents
-- Path convention:
-- permit-documents/{permit_id}/{document_id}.{ext}
-- =====================================================

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
      and (
        public.is_admin()
        or p.applicant_id = auth.uid()
        or p.assessor_id = auth.uid()
        or p.srm_id = auth.uid()
        or p.closer_id = auth.uid()
        or public.has_role('assessor')
        or public.has_role('srm')
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
      and (
        public.is_admin()
        or p.applicant_id = auth.uid()
        or public.has_role('assessor')
        or public.has_role('srm')
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
);