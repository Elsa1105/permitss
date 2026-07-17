-- Migration 0019: Corrective action + expected rectification date on Stage II
--
-- When the Safety Assessor marks a permit Not Fit for Work, Alex's requirement
-- is that the assessor must also record what corrective action is required
-- and by when it's expected to be rectified. This extends permit_submit_stage2
-- with two new optional parameters, persisted into permit_stages.data
-- alongside the existing fit/remarks/checklist fields.

drop function if exists public.permit_submit_stage2(uuid, boolean, text, jsonb);

create function public.permit_submit_stage2(
  p_permit_id uuid,
  p_fit boolean,
  p_remarks text default null,
  p_checklist jsonb default '{}'::jsonb,
  p_corrective_action text default null,
  p_rectification_date date default null
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

  -- NEW: corrective action + expected rectification date are mandatory
  -- whenever the assessor marks the location/employee Not Fit for Work.
  if p_fit is false and length(trim(coalesce(p_corrective_action, ''))) = 0 then
    raise exception 'Corrective action is required when marking Not Fit';
  end if;

  if p_fit is false and p_rectification_date is null then
    raise exception 'Expected rectification date is required when marking Not Fit';
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
      'position', 'Safety Assessor',
      'corrective_action', nullif(trim(coalesce(p_corrective_action, '')), ''),
      'rectification_date', p_rectification_date
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
      'checklist', p_checklist,
      'corrective_action', p_corrective_action,
      'rectification_date', p_rectification_date
    )
  );

  return jsonb_build_object(
    'permit_id', p_permit_id,
    'from_state', v_from_state,
    'to_state', v_to_state,
    'fit', p_fit,
    'corrective_action', p_corrective_action,
    'rectification_date', p_rectification_date
  );
end;
$$;
