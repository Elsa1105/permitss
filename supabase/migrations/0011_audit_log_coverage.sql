-- =====================================================
-- Migration 0011: Audit Log Coverage (FIXED)
-- =====================================================

-- =====================================================
-- 1. ADD ENUM SAFELY
-- =====================================================
do $$
begin
  alter type public.audit_action add value if not exists 'photo_updated';
exception when duplicate_object then null;
end $$;

-- =====================================================
-- 2. AUDIT PERMIT PHOTOS
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
      new.uploaded_by,
      jsonb_build_object(
        'photo_id', new.id,
        'storage_path', new.storage_path
      )
    );
    return new;
  end if;

  if tg_op = 'UPDATE' then
    perform public.write_audit(
      new.permit_id,
      'permit_updated',
      new.uploaded_by,
      jsonb_build_object(
        'type', 'photo_updated',
        'photo_id', new.id
      )
    );
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform public.write_audit(
      old.permit_id,
      'photo_removed',
      old.uploaded_by,
      jsonb_build_object(
        'photo_id', old.id
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
for each row execute function public.audit_permit_photos();

drop trigger if exists trg_audit_permit_photos_update on public.permit_photos;
create trigger trg_audit_permit_photos_update
after update on public.permit_photos
for each row execute function public.audit_permit_photos();

drop trigger if exists trg_audit_permit_photos_delete on public.permit_photos;
create trigger trg_audit_permit_photos_delete
after delete on public.permit_photos
for each row execute function public.audit_permit_photos();

-- =====================================================
-- 3. AUDIT DOCUMENTS
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
      new.uploaded_by,
      jsonb_build_object(
        'document_id', new.id,
        'file_name', new.file_name
      )
    );
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform public.write_audit(
      old.permit_id,
      'document_removed',
      old.uploaded_by,
      jsonb_build_object(
        'document_id', old.id
      )
    );
    return old;
  end if;

  return null;
end;
$$;

-- safe trigger creation
do $$
begin
  if to_regclass('public.permit_documents') is not null then

    execute 'drop trigger if exists trg_doc_insert on public.permit_documents';
    execute '
      create trigger trg_doc_insert
      after insert on public.permit_documents
      for each row execute function public.audit_permit_documents()
    ';

    execute 'drop trigger if exists trg_doc_delete on public.permit_documents';
    execute '
      create trigger trg_doc_delete
      after delete on public.permit_documents
      for each row execute function public.audit_permit_documents()
    ';

  end if;
end $$;

-- =====================================================
-- 4. AUDIT PERMIT UPDATE (HEADER)
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
  if old.description is distinct from new.description then
    v_changed := v_changed || jsonb_build_object('description_changed', true);
  end if;

  if old.location_of_work is distinct from new.location_of_work then
    v_changed := v_changed || jsonb_build_object('location_changed', true);
  end if;

  if v_changed <> '{}'::jsonb then
    perform public.write_audit(
      new.id,
      'permit_updated',
      auth.uid(),
      v_changed
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_permit_update on public.permits;
create trigger trg_permit_update
after update on public.permits
for each row execute function public.audit_permit_updates();

-- =====================================================
-- 5. AUDIT USER UPDATE
-- =====================================================
create or replace function public.audit_user_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action public.audit_action := 'user_updated';
begin
  if old.active is distinct from new.active then
    if new.active then
      v_action := 'user_activated';
    else
      v_action := 'user_deactivated';
    end if;
  end if;

  perform public.write_audit(
    null,
    v_action,
    auth.uid(),
    jsonb_build_object(
      'target_user', new.id
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_user_update on public.users;
create trigger trg_user_update
after update on public.users
for each row execute function public.audit_user_updates();