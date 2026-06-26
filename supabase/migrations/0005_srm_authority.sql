-- Migration 0005: SRM authority over all stages
--
-- Per client direction (May 2026): the Ship-Repair Manager has authority to
-- act on Stage I, Stage II, Day 2-14 endorsements, and Stage IV close-out
-- in addition to their own Stage III approval. This lets an SRM step in for
-- an absent foreman or safety assessor without breaking the audit trail.
--
-- Separation of duties is preserved for Stage III: an SRM cannot approve a
-- permit they themselves raised (this guard remains in permit_submit_stage3).
-- Every override is recorded in audit_log with the actor's user id, so
-- "who actually clicked the button" is always recoverable.

-- =========================================================
-- Stage I: applicant OR srm OR admin
-- =========================================================
create or replace function public.permit_submit_stage1(
  p_permit_id uuid,
  p_stage_data jsonb
) returns public.permits
language plpgsql security definer
set search_path = public
as $$
declare
  v_permit public.permits;
  v_user public.users;
  v_acting_as text;
begin
  select * into v_user from public.users where id = auth.uid();
  if v_user is null or not v_user.active then
    raise exception 'Unauthorized';
  end if;

  select * into v_permit from public.permits where id = p_permit_id for update;
  if v_permit is null then raise exception 'Permit not found'; end if;

  -- Authority: applicant of record, OR srm/admin acting in override capacity
  if v_permit.applicant_id <> v_user.id
     and v_user.role not in ('srm','admin') then
    raise exception 'Only the applicant or an SRM/Admin can submit Stage I';
  end if;

  if v_permit.state <> 'draft' then
    raise exception 'Stage I can only be submitted from draft (current: %)', v_permit.state;
  end if;

  -- Enforce three checklist booleans
  if not (
    coalesce((p_stage_data->>'check_ventilation')::boolean, false) and
    coalesce((p_stage_data->>'check_display')::boolean, false) and
    coalesce((p_stage_data->>'check_watchman')::boolean, false)
  ) then
    raise exception 'All three Stage I safety checklist items must be confirmed';
  end if;

  v_acting_as := case
    when v_permit.applicant_id = v_user.id then 'self'
    else v_user.role::text || '_override'
  end;

  insert into public.permit_stages (permit_id, stage, user_id, data)
    values (
      p_permit_id, 'I', v_user.id,
      p_stage_data || jsonb_build_object(
        'name', v_user.full_name,
        'department', v_user.department,
        'acting_as', v_acting_as
      )
    )
    on conflict (permit_id, stage) do update
      set user_id = excluded.user_id, data = excluded.data, submitted_at = now();

  update public.permits
    set state = 'pending_safety_assessment'
    where id = p_permit_id
    returning * into v_permit;

  perform public.write_audit(
    p_permit_id, 'submitted', 'draft',
    'pending_safety_assessment',
    case when v_acting_as <> 'self' then 'SRM/Admin override on behalf of applicant' end,
    p_stage_data || jsonb_build_object('acting_as', v_acting_as)
  );
  return v_permit;
end $$;

-- =========================================================
-- Stage II: assessor OR srm OR admin
-- =========================================================
create or replace function public.permit_submit_stage2(
  p_permit_id uuid,
  p_fit boolean,
  p_remarks text
) returns public.permits
language plpgsql security definer
set search_path = public
as $$
declare
  v_permit public.permits;
  v_user public.users;
  v_from permit_state;
  v_to   permit_state;
  v_action audit_action;
  v_acting_as text;
begin
  select * into v_user from public.users where id = auth.uid();
  if v_user is null or not v_user.active then raise exception 'Unauthorized'; end if;

  -- Authority: assessor with hot_work_assessor qualification, OR srm/admin
  if v_user.role not in ('assessor','srm','admin') then
    raise exception 'Only Safety Assessors or SRMs can endorse Stage II';
  end if;
  if v_user.role = 'assessor'
     and not ('hot_work_assessor' = any(v_user.qualified_for)) then
    raise exception 'User is not qualified to endorse Hot Work Stage II';
  end if;

  select * into v_permit from public.permits where id = p_permit_id for update;
  if v_permit is null then raise exception 'Permit not found'; end if;
  if v_permit.state <> 'pending_safety_assessment' then
    raise exception 'Stage II only allowed when pending safety assessment (current: %)', v_permit.state;
  end if;

  if not p_fit and (p_remarks is null or char_length(p_remarks) = 0) then
    raise exception 'Remarks are required when marking not fit';
  end if;

  v_from := v_permit.state;
  if p_fit then
    v_to := 'pending_srm_approval';
    v_action := 'fit';
  else
    v_to := 'not_fit';
    v_action := 'not_fit';
  end if;

  v_acting_as := case
    when v_user.role = 'assessor' then 'self'
    else v_user.role::text || '_override'
  end;

  insert into public.permit_stages (permit_id, stage, user_id, data)
    values (
      p_permit_id, 'II', v_user.id,
      jsonb_build_object(
        'fit', p_fit,
        'remarks', p_remarks,
        'name', v_user.full_name,
        'position', v_user.department,
        'acting_as', v_acting_as
      )
    )
    on conflict (permit_id, stage) do update
      set user_id = excluded.user_id, data = excluded.data, submitted_at = now();

  update public.permits
    set assessor_id = v_user.id, state = v_to
    where id = p_permit_id
    returning * into v_permit;

  perform public.write_audit(
    p_permit_id, v_action, v_from, v_to,
    coalesce(p_remarks, case when v_acting_as <> 'self' then 'SRM/Admin override Stage II' end),
    jsonb_build_object('acting_as', v_acting_as)
  );
  return v_permit;
end $$;

-- =========================================================
-- Stage IV: applicant OR srm OR admin
-- (was already applicant-or-admin; we now explicitly include SRM)
-- =========================================================
create or replace function public.permit_submit_stage4(p_permit_id uuid)
returns public.permits
language plpgsql security definer
set search_path = public
as $$
declare
  v_permit public.permits;
  v_user public.users;
  v_acting_as text;
  v_from permit_state;
begin
  select * into v_user from public.users where id = auth.uid();
  if v_user is null or not v_user.active then raise exception 'Unauthorized'; end if;

  select * into v_permit from public.permits where id = p_permit_id for update;
  if v_permit is null then raise exception 'Permit not found'; end if;

  if v_permit.applicant_id <> v_user.id
     and v_user.role not in ('srm','admin') then
    raise exception 'Only the applicant, SRM, or admin can submit Stage IV close-out';
  end if;

  if v_permit.state not in ('approved_active','pending_daily_endorsement','pending_closure') then
    raise exception 'Permit is not in a closable state (current: %)', v_permit.state;
  end if;

  v_acting_as := case
    when v_permit.applicant_id = v_user.id then 'self'
    else v_user.role::text || '_override'
  end;

  insert into public.permit_stages (permit_id, stage, user_id, data)
    values (
      p_permit_id, 'IV', v_user.id,
      jsonb_build_object(
        'name', v_user.full_name,
        'department', v_user.department,
        'acting_as', v_acting_as
      )
    )
    on conflict (permit_id, stage) do update
      set user_id = excluded.user_id, data = excluded.data, submitted_at = now();

  v_from := v_permit.state;
  update public.permits
    set closer_id = v_user.id, state = 'closed_completed'
    where id = p_permit_id
    returning * into v_permit;

  perform public.write_audit(
    p_permit_id, 'closed', v_from, 'closed_completed',
    case when v_acting_as <> 'self' then 'SRM/Admin override close-out' end,
    jsonb_build_object('acting_as', v_acting_as)
  );
  return v_permit;
end $$;

-- =========================================================
-- RLS: allow SRM to insert drafts (raise on behalf of foreman)
-- =========================================================
drop policy if exists permits_insert_draft on public.permits;
create policy permits_insert_draft
  on public.permits for insert
  to authenticated
  with check (
    applicant_id = auth.uid()
    and state = 'draft'
    and (public.has_role('applicant') or public.has_role('srm') or public.is_admin())
  );

-- Allow SRM to edit draft permits they raised (header fields)
drop policy if exists permits_update_draft on public.permits;
create policy permits_update_draft
  on public.permits for update
  to authenticated
  using (
    state = 'draft'
    and (applicant_id = auth.uid() or public.has_role('srm') or public.is_admin())
  )
  with check (
    state = 'draft'
    and (applicant_id = auth.uid() or public.has_role('srm') or public.is_admin())
  );

-- =========================================================
-- RLS: ensure SRM can read all permits (for override visibility)
-- =========================================================
-- Existing policy already allows SRM to see permits in approved_active /
-- pending_srm_approval / pending_daily_endorsement / pending_closure states.
-- Extend so SRMs can also see Drafts and pending_safety_assessment when
-- exercising override authority.
drop policy if exists permits_read on public.permits;
create policy permits_read
  on public.permits for select
  to authenticated
  using (
    public.is_admin()
    or applicant_id = auth.uid()
    or assessor_id  = auth.uid()
    or srm_id       = auth.uid()
    or closer_id    = auth.uid()
    or (public.has_role('assessor') and state = 'pending_safety_assessment')
    or (public.has_role('srm'))   -- SRMs see every permit (override authority)
  );
