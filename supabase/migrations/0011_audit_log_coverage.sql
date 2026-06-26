-- Migration 0011: Audit Log Coverage Completion
-- Covers photos, documents, permit header updates, user changes, and site-scoped role changes.

-- =====================================================
-- 1. Audit permit photo insert/delete
-- =====================================================

create or replace function public.audit_permit_photos()
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
        'uploaded_by', new.uploaded_by,
        'uploaded_at', new.uploaded_at,
        'has_annotation', new.annotation_data is not null
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
        'uploaded_by', old.uploaded_by,
        'uploaded_at', old.uploaded_at,
        'has_annotation', old.annotation_data is not null
      )
    );

    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_audit_permit_photos_insert on public.permit_photos;
create trigger trg_audit_permit_photos_insert
after insert on public.permit_photos
for each row
execute function public.audit_permit_photos();

drop trigger if exists trg_audit_permit_photos_delete on public.permit_photos;
create trigger trg_audit_permit_photos_delete
after delete on public.permit_photos
for each row
execute function public.audit_permit_photos();


-- =====================================================
-- 2. Audit permit document insert/delete
-- Only creates trigger if permit_documents table exists.
-- =====================================================

create or replace function public.audit_permit_documents()
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
        'mime_type', new.mime_type,
        'file_size', new.file_size,
        'uploaded_by', new.uploaded_by,
        'created_at', new.created_at
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
        'mime_type', old.mime_type,
        'file_size', old.file_size,
        'uploaded_by', old.uploaded_by,
        'created_at', old.created_at
      )
    );

    return old;
  end if;

  return null;
end;
$$;

do $$
begin
  if to_regclass('public.permit_documents') is not null then
    execute 'drop trigger if exists trg_audit_permit_documents_insert on public.permit_documents';

    execute '
      create trigger trg_audit_permit_documents_insert
      after insert on public.permit_documents
      for each row
      execute function public.audit_permit_documents()
    ';

    execute 'drop trigger if exists trg_audit_permit_documents_delete on public.permit_documents';

    execute '
      create trigger trg_audit_permit_documents_delete
      after delete on public.permit_documents
      for each row
      execute function public.audit_permit_documents()
    ';
  end if;
end;
$$;


-- =====================================================
-- 3. Audit permit header/detail updates
-- Does not duplicate state-transition audit.
-- Only logs when non-state permit fields change.
-- =====================================================

create or replace function public.audit_permit_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changed jsonb := '{}'::jsonb;
begin
  if old.vessel_project is distinct from new.vessel_project then
    v_changed := v_changed || jsonb_build_object(
      'vessel_project',
      jsonb_build_object('old', old.vessel_project, 'new', new.vessel_project)
    );
  end if;

  if old.location_of_work is distinct from new.location_of_work then
    v_changed := v_changed || jsonb_build_object(
      'location_of_work',
      jsonb_build_object('old', old.location_of_work, 'new', new.location_of_work)
    );
  end if;

  if old.date_commencement is distinct from new.date_commencement then
    v_changed := v_changed || jsonb_build_object(
      'date_commencement',
      jsonb_build_object('old', old.date_commencement, 'new', new.date_commencement)
    );
  end if;

  if old.date_completion is distinct from new.date_completion then
    v_changed := v_changed || jsonb_build_object(
      'date_completion',
      jsonb_build_object('old', old.date_completion, 'new', new.date_completion)
    );
  end if;

  if old.description is distinct from new.description then
    v_changed := v_changed || jsonb_build_object(
      'description',
      jsonb_build_object('old', old.description, 'new', new.description)
    );
  end if;

  if old.hazard_types is distinct from new.hazard_types then
    v_changed := v_changed || jsonb_build_object(
      'hazard_types',
      jsonb_build_object('old', old.hazard_types, 'new', new.hazard_types)
    );
  end if;

  if old.contractor is distinct from new.contractor then
    v_changed := v_changed || jsonb_build_object(
      'contractor',
      jsonb_build_object('old', old.contractor, 'new', new.contractor)
    );
  end if;

  if old.company_id is distinct from new.company_id then
    v_changed := v_changed || jsonb_build_object(
      'company_id',
      jsonb_build_object('old', old.company_id, 'new', new.company_id)
    );
  end if;

  if old.site_id is distinct from new.site_id then
    v_changed := v_changed || jsonb_build_object(
      'site_id',
      jsonb_build_object('old', old.site_id, 'new', new.site_id)
    );
  end if;

  if old.contractor_company is distinct from new.contractor_company then
    v_changed := v_changed || jsonb_build_object(
      'contractor_company',
      jsonb_build_object('old', old.contractor_company, 'new', new.contractor_company)
    );
  end if;

  if old.contractor_supervisor_name is distinct from new.contractor_supervisor_name then
    v_changed := v_changed || jsonb_build_object(
      'contractor_supervisor_name',
      jsonb_build_object('old', old.contractor_supervisor_name, 'new', new.contractor_supervisor_name)
    );
  end if;

  if old.contractor_supervisor_registration_no is distinct from new.contractor_supervisor_registration_no then
    v_changed := v_changed || jsonb_build_object(
      'contractor_supervisor_registration_no',
      jsonb_build_object(
        'old', old.contractor_supervisor_registration_no,
        'new', new.contractor_supervisor_registration_no
      )
    );
  end if;

  if old.worker_briefing_acknowledged is distinct from new.worker_briefing_acknowledged then
    v_changed := v_changed || jsonb_build_object(
      'worker_briefing_acknowledged',
      jsonb_build_object(
        'old', old.worker_briefing_acknowledged,
        'new', new.worker_briefing_acknowledged
      )
    );
  end if;

  if old.top_controls_summary is distinct from new.top_controls_summary then
    v_changed := v_changed || jsonb_build_object(
      'top_controls_summary',
      jsonb_build_object('old', old.top_controls_summary, 'new', new.top_controls_summary)
    );
  end if;

  if v_changed <> '{}'::jsonb then
    perform public.write_audit(
      new.id,
      'permit_updated',
      old.state,
      new.state,
      null,
      jsonb_build_object(
        'changed_fields', v_changed,
        'updated_at', now()
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_audit_permit_updates on public.permits;
create trigger trg_audit_permit_updates
after update on public.permits
for each row
execute function public.audit_permit_updates();


-- =====================================================
-- 4. Audit user role/status/profile changes
-- permit_id is null because this is admin/user audit.
-- =====================================================

create or replace function public.audit_user_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text := 'user_updated';
  v_changed jsonb := '{}'::jsonb;
begin
  if old.active is distinct from new.active then
    if new.active = true then
      v_action := 'user_activated';
    else
      v_action := 'user_deactivated';
    end if;

    v_changed := v_changed || jsonb_build_object(
      'active',
      jsonb_build_object('old', old.active, 'new', new.active)
    );
  end if;

  if old.role is distinct from new.role then
    v_changed := v_changed || jsonb_build_object(
      'role',
      jsonb_build_object('old', old.role, 'new', new.role)
    );
  end if;

  if old.full_name is distinct from new.full_name then
    v_changed := v_changed || jsonb_build_object(
      'full_name',
      jsonb_build_object('old', old.full_name, 'new', new.full_name)
    );
  end if;

  if old.department is distinct from new.department then
    v_changed := v_changed || jsonb_build_object(
      'department',
      jsonb_build_object('old', old.department, 'new', new.department)
    );
  end if;

  if old.qualified_for is distinct from new.qualified_for then
    v_changed := v_changed || jsonb_build_object(
      'qualified_for',
      jsonb_build_object('old', old.qualified_for, 'new', new.qualified_for)
    );
  end if;

  if v_changed <> '{}'::jsonb then
    perform public.write_audit(
      null,
      v_action,
      null,
      null,
      null,
      jsonb_build_object(
        'target_user_id', new.id,
        'target_user_email', new.email,
        'changed_fields', v_changed,
        'updated_at', now()
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_audit_user_updates on public.users;
create trigger trg_audit_user_updates
after update on public.users
for each row
execute function public.audit_user_updates();


-- =====================================================
-- 5. Audit user site role changes
-- Only if user_site_roles table exists.
-- =====================================================

create or replace function public.audit_user_site_roles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit(
      null,
      'user_site_role_added',
      null,
      null,
      null,
      jsonb_build_object(
        'user_site_role_id', new.id,
        'target_user_id', new.user_id,
        'company_id', new.company_id,
        'site_id', new.site_id,
        'role', new.role,
        'active', new.active
      )
    );

    return new;
  end if;

  if tg_op = 'UPDATE' then
    perform public.write_audit(
      null,
      'user_site_role_updated',
      null,
      null,
      null,
      jsonb_build_object(
        'user_site_role_id', new.id,
        'target_user_id', new.user_id,
        'old_company_id', old.company_id,
        'new_company_id', new.company_id,
        'old_site_id', old.site_id,
        'new_site_id', new.site_id,
        'old_role', old.role,
        'new_role', new.role,
        'old_active', old.active,
        'new_active', new.active
      )
    );

    return new;
  end if;

  if tg_op = 'DELETE' then
    perform public.write_audit(
      null,
      'user_site_role_removed',
      null,
      null,
      null,
      jsonb_build_object(
        'user_site_role_id', old.id,
        'target_user_id', old.user_id,
        'company_id', old.company_id,
        'site_id', old.site_id,
        'role', old.role,
        'active', old.active
      )
    );

    return old;
  end if;

  return null;
end;
$$;

do $$
begin
  if to_regclass('public.user_site_roles') is not null then
    execute 'drop trigger if exists trg_audit_user_site_roles_insert on public.user_site_roles';

    execute '
      create trigger trg_audit_user_site_roles_insert
      after insert on public.user_site_roles
      for each row
      execute function public.audit_user_site_roles()
    ';

    execute 'drop trigger if exists trg_audit_user_site_roles_update on public.user_site_roles';

    execute '
      create trigger trg_audit_user_site_roles_update
      after update on public.user_site_roles
      for each row
      execute function public.audit_user_site_roles()
    ';

    execute 'drop trigger if exists trg_audit_user_site_roles_delete on public.user_site_roles';

    execute '
      create trigger trg_audit_user_site_roles_delete
      after delete on public.user_site_roles
      for each row
      execute function public.audit_user_site_roles()
    ';
  end if;
end;
$$;