-- Migration 0012: Client Revisions Core
-- Covers:
-- - Editable applicant name/department
-- - Other hazard text
-- - Supporting documents / RA persistence
-- - Stage II checklist N/A support through JSON data
-- - Audit coverage for document/photo update

-- =====================================================
-- 1. Permit client revision fields
-- =====================================================

alter table public.permits
add column if not exists display_applicant_name text,
add column if not exists display_applicant_department text,
add column if not exists other_hazard_text text;

-- =====================================================
-- 2. Permit documents
-- =====================================================

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'permit_document_type'
  ) then
    create type public.permit_document_type as enum (
      'risk_assessment',
      'jsa',
      'method_statement',
      'gas_test_record',
      'other'
    );
  end if;
end $$;

create table if not exists public.permit_documents (
  id uuid primary key default gen_random_uuid(),
  permit_id uuid not null references public.permits(id) on delete cascade,
  uploaded_by uuid not null references public.users(id) on delete restrict,
  document_type public.permit_document_type not null default 'other',
  file_name text not null,
  storage_path text not null,
  mime_type text,
  file_size bigint,
  created_at timestamptz not null default now()
);

create index if not exists idx_permit_documents_permit_id
on public.permit_documents(permit_id);

create index if not exists idx_permit_documents_uploaded_by
on public.permit_documents(uploaded_by);

create index if not exists idx_permit_documents_document_type
on public.permit_documents(document_type);

-- =====================================================
-- 3. Permit documents RLS
-- =====================================================

alter table public.permit_documents enable row level security;

drop policy if exists "permit_documents read visible permits" on public.permit_documents;
create policy "permit_documents read visible permits"
on public.permit_documents
for select
to authenticated
using (
  public.can_view_permit_site(permit_id)
);

drop policy if exists "permit_documents insert editable permits" on public.permit_documents;
create policy "permit_documents insert editable permits"
on public.permit_documents
for insert
to authenticated
with check (
  uploaded_by = auth.uid()
  and exists (
    select 1
    from public.permits p
    where p.id = permit_id
      and (
        public.is_admin()
        or p.applicant_id = auth.uid()
        or p.srm_id = auth.uid()
      )
      and p.state in ('draft', 'pending_safety_assessment')
  )
);

drop policy if exists "permit_documents delete editable permits" on public.permit_documents;
create policy "permit_documents delete editable permits"
on public.permit_documents
for delete
to authenticated
using (
  exists (
    select 1
    from public.permits p
    where p.id = permit_id
      and (
        public.is_admin()
        or p.applicant_id = auth.uid()
        or p.srm_id = auth.uid()
      )
      and p.state in ('draft', 'pending_safety_assessment')
  )
);

-- =====================================================
-- 4. Storage bucket helper note
-- =====================================================
-- Bucket name expected:
-- permit-documents
--
-- Create the bucket in Supabase Storage if not created yet.

-- =====================================================
-- 5. Audit trigger for permit documents
-- =====================================================

create or replace function public.audit_permit_document_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit(
      new.permit_id,
      'document_added',
      null,
      null,
      null,
      jsonb_build_object(
        'document_id', new.id,
        'document_type', new.document_type,
        'file_name', new.file_name,
        'storage_path', new.storage_path,
        'uploaded_by', new.uploaded_by
      )
    );

    return new;
  end if;

  if tg_op = 'DELETE' then
    perform public.write_audit(
      old.permit_id,
      'document_removed',
      null,
      null,
      null,
      jsonb_build_object(
        'document_id', old.id,
        'document_type', old.document_type,
        'file_name', old.file_name,
        'storage_path', old.storage_path,
        'uploaded_by', old.uploaded_by
      )
    );

    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_audit_permit_document_insert on public.permit_documents;
create trigger trg_audit_permit_document_insert
after insert on public.permit_documents
for each row
execute function public.audit_permit_document_change();

drop trigger if exists trg_audit_permit_document_delete on public.permit_documents;
create trigger trg_audit_permit_document_delete
after delete on public.permit_documents
for each row
execute function public.audit_permit_document_change();

-- =====================================================
-- 6. Photo annotation audit
-- =====================================================

create or replace function public.audit_permit_photo_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit(
      new.permit_id,
      'photo_added',
      null,
      null,
      null,
      jsonb_build_object(
        'photo_id', new.id,
        'storage_path', new.storage_path,
        'uploaded_by', new.uploaded_by
      )
    );

    return new;
  end if;

  if tg_op = 'DELETE' then
    perform public.write_audit(
      old.permit_id,
      'photo_removed',
      null,
      null,
      null,
      jsonb_build_object(
        'photo_id', old.id,
        'storage_path', old.storage_path,
        'uploaded_by', old.uploaded_by
      )
    );

    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.annotation_data is distinct from new.annotation_data then
      perform public.write_audit(
        new.permit_id,
        'permit_updated',
        null,
        null,
        'Photo annotation updated',
        jsonb_build_object(
          'photo_id', new.id,
          'storage_path', new.storage_path,
          'annotation_updated', true
        )
      );
    end if;

    return new;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_audit_permit_photo_insert on public.permit_photos;
create trigger trg_audit_permit_photo_insert
after insert on public.permit_photos
for each row
execute function public.audit_permit_photo_change();

drop trigger if exists trg_audit_permit_photo_delete on public.permit_photos;
create trigger trg_audit_permit_photo_delete
after delete on public.permit_photos
for each row
execute function public.audit_permit_photo_change();

drop trigger if exists trg_audit_permit_photo_update on public.permit_photos;
create trigger trg_audit_permit_photo_update
after update on public.permit_photos
for each row
execute function public.audit_permit_photo_change();

-- =====================================================
-- 7. Replace Stage II RPC to preserve checklist JSON
-- =====================================================

drop function if exists public.permit_submit_stage2(uuid, boolean, text, jsonb);

create function public.permit_submit_stage2(
  p_permit_id uuid,
  p_fit boolean,
  p_remarks text default null,
  p_checklist jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_from_state public.permit_state;
  v_to_state public.permit_state;
  v_audit_action public.audit_action;
  v_company_id uuid;
  v_site_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  select
    p.state,
    p.company_id,
    p.site_id
  into
    v_from_state,
    v_company_id,
    v_site_id
  from public.permits p
  where p.id = p_permit_id
  for update;

  if v_from_state is null then
    raise exception 'Permit not found';
  end if;

  if v_from_state <> 'pending_safety_assessment' then
    raise exception 'Permit is not pending safety assessment. Current state: %', v_from_state;
  end if;

  if not (
    public.is_admin()
    or exists (
      select 1
      from public.users u
      where u.id = v_user_id
        and u.active = true
        and (
          u.role = 'assessor'
          or 'hot_work_assessor' = any(coalesce(u.qualified_for, array[]::text[]))
        )
    )
    or (
      v_company_id is not null
      and v_site_id is not null
      and public.has_site_role(v_company_id, v_site_id, 'assessor')
    )
  ) then
    raise exception 'Only qualified Safety Assessors can submit Stage II';
  end if;

  if p_fit is false and length(trim(coalesce(p_remarks, ''))) = 0 then
    raise exception 'Remarks are required when marking Not Fit';
  end if;

  if p_fit is true then
    v_to_state := 'pending_srm_approval';
    v_audit_action := 'fit';
  else
    v_to_state := 'not_fit';
    v_audit_action := 'not_fit';
  end if;

  insert into public.permit_stages (
    permit_id,
    stage,
    user_id,
    data
  )
  values (
    p_permit_id,
    'II',
    v_user_id,
    jsonb_build_object(
      'fit', p_fit,
      'remarks', nullif(trim(coalesce(p_remarks, '')), ''),
      'checklist', p_checklist,
      'checklist_status', p_checklist,
      'position', 'Safety Assessor'
    )
  );

  update public.permits
  set
    state = v_to_state,
    assessor_id = v_user_id,
    updated_at = now()
  where id = p_permit_id;

  perform public.write_audit(
    p_permit_id,
    v_audit_action,
    v_from_state,
    v_to_state,
    p_remarks,
    jsonb_build_object(
      'fit', p_fit,
      'remarks', p_remarks,
      'checklist', p_checklist
    )
  );

  return jsonb_build_object(
    'permit_id', p_permit_id,
    'from_state', v_from_state,
    'to_state', v_to_state,
    'fit', p_fit
  );
end;
$$;