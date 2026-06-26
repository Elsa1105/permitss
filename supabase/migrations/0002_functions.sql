-- Migration 0002: Server-side functions for permit lifecycle.
-- All state transitions go through these. Client code never updates
-- permits.state directly --- RLS denies it.

-- =========================================================
-- HELPERS: is_admin / has_qualification / current_user_row
-- =========================================================
create or replace function public.current_user_row()
returns public.users
language sql stable security definer
set search_path = public
as $$
  select * from public.users where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((select role = 'admin' and active from public.users where id = auth.uid()), false)
$$;

create or replace function public.has_role(want user_role)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((select role = want and active from public.users where id = auth.uid()), false)
$$;

create or replace function public.has_qualification(qual text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select qual = any(qualified_for) and active from public.users where id = auth.uid()),
    false
  )
$$;

-- =========================================================
-- PERMIT NUMBERING
-- =========================================================
-- Atomic next-number generator. Format: FOI-HWP-YYYY-NNN
create or replace function public.next_permit_serial(p_permit_type text default 'hot_work_onshore')
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  v_year int := extract(year from now() at time zone 'Asia/Singapore')::int;
  v_next int;
  v_prefix text;
begin
  insert into public.permit_counters (permit_type, year, current_value)
    values (p_permit_type, v_year, 1)
    on conflict (permit_type, year)
    do update set current_value = public.permit_counters.current_value + 1
    returning current_value into v_next;

  v_prefix := case p_permit_type
                when 'hot_work_onshore' then 'FOI-HWP'
                else 'FOI-PMT'
              end;

  return format('%s-%s-%s', v_prefix, v_year, lpad(v_next::text, 3, '0'));
end $$;

-- =========================================================
-- AUDIT WRITER
-- =========================================================
create or replace function public.write_audit(
  p_permit_id uuid,
  p_action   audit_action,
  p_from     permit_state,
  p_to       permit_state,
  p_reason   text,
  p_metadata jsonb default null
) returns void
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.audit_log
    (permit_id, actor_id, action, from_state, to_state, reason, metadata)
  values
    (p_permit_id, auth.uid(), p_action, p_from, p_to, p_reason, p_metadata);
end $$;

-- =========================================================
-- TRANSITIONS (the only way state changes happen)
-- =========================================================

-- Stage I: applicant submits draft -> pending_safety_assessment
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
begin
  select * into v_user from public.users where id = auth.uid();
  if v_user is null or not v_user.active then
    raise exception 'Unauthorized';
  end if;

  select * into v_permit from public.permits where id = p_permit_id for update;
  if v_permit is null then raise exception 'Permit not found'; end if;

  if v_permit.applicant_id <> v_user.id then
    raise exception 'Only the applicant can submit Stage I';
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

  insert into public.permit_stages (permit_id, stage, user_id, data)
    values (p_permit_id, 'I', v_user.id, p_stage_data)
    on conflict (permit_id, stage) do update
      set user_id = excluded.user_id, data = excluded.data, submitted_at = now();

  update public.permits
    set state = 'pending_safety_assessment'
    where id = p_permit_id
    returning * into v_permit;

  perform public.write_audit(p_permit_id, 'submitted', 'draft',
                             'pending_safety_assessment', null, p_stage_data);
  return v_permit;
end $$;

-- Stage II: assessor marks fit / not fit
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
begin
  select * into v_user from public.users where id = auth.uid();
  if v_user is null or not v_user.active then raise exception 'Unauthorized'; end if;
  if not (v_user.role in ('assessor','admin')) then
    raise exception 'Only Safety Assessors can endorse Stage II';
  end if;
  if not ('hot_work_assessor' = any(v_user.qualified_for)) and v_user.role <> 'admin' then
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

  insert into public.permit_stages (permit_id, stage, user_id, data)
    values (p_permit_id, 'II', v_user.id,
            jsonb_build_object('fit', p_fit, 'remarks', p_remarks,
                               'name', v_user.full_name, 'position', v_user.department))
    on conflict (permit_id, stage) do update
      set user_id = excluded.user_id, data = excluded.data, submitted_at = now();

  update public.permits
    set assessor_id = v_user.id, state = v_to
    where id = p_permit_id
    returning * into v_permit;

  perform public.write_audit(p_permit_id, v_action, v_from, v_to, p_remarks, null);
  return v_permit;
end $$;

-- Stage III: SRM approves / rejects
create or replace function public.permit_submit_stage3(
  p_permit_id uuid,
  p_decision text,         -- 'approve' | 'reject'
  p_reason   text
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
begin
  select * into v_user from public.users where id = auth.uid();
  if v_user is null or not v_user.active then raise exception 'Unauthorized'; end if;
  if not (v_user.role in ('srm','admin')) then
    raise exception 'Only SRMs can act on Stage III';
  end if;
  if not ('hot_work_srm' = any(v_user.qualified_for)) and v_user.role <> 'admin' then
    raise exception 'User is not qualified to approve Hot Work Stage III';
  end if;

  select * into v_permit from public.permits where id = p_permit_id for update;
  if v_permit is null then raise exception 'Permit not found'; end if;
  if v_permit.state <> 'pending_srm_approval' then
    raise exception 'Stage III only allowed when pending SRM approval (current: %)', v_permit.state;
  end if;

  -- Separation of duties: SRM cannot approve a permit they raised
  if v_permit.applicant_id = v_user.id then
    raise exception 'SRMs cannot approve permits they raised themselves';
  end if;

  v_from := v_permit.state;
  if p_decision = 'approve' then
    v_to := 'approved_active';
    v_action := 'approved';
  elsif p_decision = 'reject' then
    if p_reason is null or char_length(p_reason) = 0 then
      raise exception 'Reason is required to reject a permit';
    end if;
    v_to := 'rejected';
    v_action := 'rejected';
  else
    raise exception 'Invalid decision: %', p_decision;
  end if;

  insert into public.permit_stages (permit_id, stage, user_id, data)
    values (p_permit_id, 'III', v_user.id,
            jsonb_build_object('decision', p_decision, 'reason', p_reason,
                               'name', v_user.full_name, 'department', v_user.department))
    on conflict (permit_id, stage) do update
      set user_id = excluded.user_id, data = excluded.data, submitted_at = now();

  update public.permits
    set srm_id = v_user.id, state = v_to
    where id = p_permit_id
    returning * into v_permit;

  perform public.write_audit(p_permit_id, v_action, v_from, v_to, p_reason, null);
  return v_permit;
end $$;

-- Day 2-14 endorsement
create or replace function public.permit_endorse_day(
  p_permit_id uuid,
  p_day int,
  p_action endorsement_action,
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
  v_audit audit_action;
begin
  select * into v_user from public.users where id = auth.uid();
  if v_user is null or not v_user.active then raise exception 'Unauthorized'; end if;
  if not (v_user.role in ('srm','admin')) then
    raise exception 'Only SRMs can endorse continuation';
  end if;

  select * into v_permit from public.permits where id = p_permit_id for update;
  if v_permit is null then raise exception 'Permit not found'; end if;
  if v_permit.state not in ('approved_active','pending_daily_endorsement') then
    raise exception 'Permit is not in an endorsable state (current: %)', v_permit.state;
  end if;

  if p_action <> 'continue' and (p_remarks is null or char_length(p_remarks) = 0) then
    raise exception 'Remarks required for reject/revoke endorsements';
  end if;

  v_from := v_permit.state;
  case p_action
    when 'continue' then v_to := 'approved_active'; v_audit := 'endorsed_continue';
    when 'reject'   then v_to := 'rejected';        v_audit := 'endorsed_reject';
    when 'revoke'   then v_to := 'revoked';         v_audit := 'endorsed_revoke';
  end case;

  insert into public.permit_endorsements
    (permit_id, day_number, endorser_id, action, remarks)
  values
    (p_permit_id, p_day, v_user.id, p_action, p_remarks);

  update public.permits set state = v_to where id = p_permit_id returning * into v_permit;

  perform public.write_audit(p_permit_id, v_audit, v_from, v_to, p_remarks,
                             jsonb_build_object('day', p_day));
  return v_permit;
end $$;

-- Stage IV: close-out
create or replace function public.permit_submit_stage4(p_permit_id uuid)
returns public.permits
language plpgsql security definer
set search_path = public
as $$
declare
  v_permit public.permits;
  v_user public.users;
begin
  select * into v_user from public.users where id = auth.uid();
  if v_user is null or not v_user.active then raise exception 'Unauthorized'; end if;

  select * into v_permit from public.permits where id = p_permit_id for update;
  if v_permit is null then raise exception 'Permit not found'; end if;

  -- By default, only the original applicant can close out.
  -- Admin override: admin closes on behalf (audit captures actor).
  if v_permit.applicant_id <> v_user.id and v_user.role <> 'admin' then
    raise exception 'Only the applicant (or admin) can submit Stage IV close-out';
  end if;

  if v_permit.state not in ('approved_active','pending_daily_endorsement','pending_closure') then
    raise exception 'Permit is not in a closable state (current: %)', v_permit.state;
  end if;

  insert into public.permit_stages (permit_id, stage, user_id, data)
    values (p_permit_id, 'IV', v_user.id,
            jsonb_build_object('name', v_user.full_name, 'department', v_user.department))
    on conflict (permit_id, stage) do update
      set user_id = excluded.user_id, data = excluded.data, submitted_at = now();

  update public.permits
    set closer_id = v_user.id, state = 'closed_completed'
    where id = p_permit_id
    returning * into v_permit;

  perform public.write_audit(p_permit_id, 'closed', v_permit.state,
                             'closed_completed', null, null);
  return v_permit;
end $$;

-- Auto-expire permits past completion + grace period (called by scheduler/edge fn)
create or replace function public.permit_auto_expire()
returns int
language plpgsql security definer
set search_path = public
as $$
declare
  v_count int;
begin
  with expired as (
    update public.permits
       set state = 'expired'
     where state in ('approved_active','pending_daily_endorsement','pending_closure')
       and date_completion < (current_date - interval '2 days')
    returning id, state
  )
  select count(*) into v_count from expired;
  return v_count;
end $$;
